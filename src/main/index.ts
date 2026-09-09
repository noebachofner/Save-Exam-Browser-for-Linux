import { app, BrowserWindow, dialog, globalShortcut, session } from 'electron';
import { join } from 'node:path';
import { RequestFilter } from '../core/browser/urlFilter';
import { buildUserAgent } from '../core/browser/userAgent';
import { computeBrowserExamKey } from '../core/crypto/browserExamKey';
import { parseArgs, usage, userArgs } from './cli';
import { SebHeaderInjector } from './headers';
import { installDesktopEntry, uninstallDesktopEntry } from './desktopIntegration';
import { createKioskWindow, recoverWindow } from './kioskWindow';
import { loadConfiguration, type LoadedConfiguration } from './loadConfig';
import { logger } from './logger';
import { EMERGENCY_QUIT_ACCELERATOR, RECOVER_ACCELERATOR } from './lockdown';
import { askForQuitPassword } from './quitPrompt';
import { startUpdateCheck, updatesDisabled } from './updater';

const options = parseArgs(userArgs(process.argv, app.isPackaged));

if (options.verbose) {
  logger.setLevel('debug');
}

if (options.help) {
  console.log(usage());
  app.exit(0);
}

/*
 * Window backend. Under a Wayland session Chromium defaults to XWayland, which
 * is deliberately kept: Wayland compositors generally do not let a client pin
 * itself above everything else, so native Wayland weakens the very lockdown the
 * kiosk mode is for. `--wayland` opts into it for people who need it (HiDPI
 * scaling, fractional scaling, input methods).
 */
if (options.wayland) {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');
}

if (options.install || options.uninstall) {
  void app.whenReady().then(async () => {
    try {
      const path = options.install ? await installDesktopEntry() : await uninstallDesktopEntry();
      console.log(`${options.install ? 'Installed' : 'Removed'}: ${path}`);
      if (options.install) {
        console.log('Clicking a seb:// link or a .seb file now starts this client.');
      }
      app.exit(0);
    } catch (error) {
      console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
      app.exit(1);
    }
  });
}

// A single instance only: a second launch must not create an escape hatch out of
// a running exam session.
const managementCommand = options.help || options.install || options.uninstall;
if (!managementCommand && !app.requestSingleInstanceLock()) {
  logger.error('Another instance is already running.');
  // Exiting silently here looks exactly like the client failing to launch: the
  // user clicks, nothing happens, and there is no window to explain why. Say so
  // on screen before quitting. showErrorBox works before the app is ready.
  dialog.showErrorBox(
    'Safe Exam Browser is already running',
    'Another instance of Safe Exam Browser for Linux is already running, so this one will close.\n\n' +
      'If no window is visible, a previous session is still active in the background. ' +
      'End it with:\n\n    pkill -f seb-linux\n\nthen start the client again.',
  );
  app.exit(1);
}

let mainWindow: BrowserWindow | undefined;
let configuration: LoadedConfiguration | undefined;
let allowClose = false;
/**
 * False until start-up has finished creating its window. Start-up may briefly
 * hold no window at all — the sign-in window closes before the exam window
 * exists — and quitting at that moment would end the session immediately after
 * a successful sign-in.
 */
let startupFinished = false;

function buildFilter(config: LoadedConfiguration): RequestFilter | undefined {
  if (!config.settings.filterEnabled || config.settings.filterRules.length === 0) {
    return undefined;
  }
  const filter = new RequestFilter(config.settings.filterDefault);
  filter.loadAll(config.settings.filterRules);
  logger.info(`URL filter active with ${config.settings.filterRules.length} rule(s).`);
  return filter;
}

function resolveBrowserExamKey(config: LoadedConfiguration): string {
  const configured = config.settings.browserExamKey.trim();
  if (configured.length > 0) {
    logger.info('Using the Browser Exam Key supplied by the configuration.');
    return configured;
  }
  if (config.settings.examKeySalt.length > 0) {
    // Derived key: only meaningful if the institution has whitelisted it.
    return computeBrowserExamKey({
      configurationKey: config.configKey,
      salt: config.settings.examKeySalt,
    });
  }
  return '';
}

async function startSession(): Promise<void> {
  configuration = await loadConfiguration(options.source, options.password);
  const { settings, configKey } = configuration;

  if (options.verify) {
    console.log(`Config Key : ${configKey || '(none)'}`);
    console.log(`Start URL  : ${settings.startUrl}`);
    console.log(`Headers    : ${settings.sendCustomHeaders ? 'enabled' : 'disabled'}`);
    console.log(
      `URL filter : ${settings.filterEnabled ? `${settings.filterRules.length} rule(s)` : 'disabled'}`,
    );
    app.exit(0);
    return;
  }

  const browserExamKey = resolveBrowserExamKey(configuration);

  // Default to the Windows token: .seb configurations are authored for the
  // Windows client, and some exam front-ends gate on it. Override with
  // --platform=linux to identify honestly as a Linux client.
  const userAgent = buildUserAgent({
    baseUserAgent: session.defaultSession.getUserAgent(),
    platform: options.platform ?? 'windows',
    suffix: settings.userAgentSuffix,
    custom: settings.customUserAgent,
  });
  logger.info(`User agent: ${userAgent}`);

  const injector = new SebHeaderInjector({
    configKey,
    browserExamKey,
    sendConfigKey: settings.sendCustomHeaders && configKey.length > 0,
    sendBrowserExamKey: settings.sendCustomHeaders && browserExamKey.length > 0,
  });
  injector.install(session.defaultSession);
  session.defaultSession.setUserAgent(userAgent);

  const filter = buildFilter(configuration);

  mainWindow = createKioskWindow({
    settings,
    userAgent,
    filter,
    kiosk: !options.noKiosk,
    allowSwitching: options.allowSwitching,
    onNavigate: (url) => injector.setCurrentPageUrl(url),
    onEmergencyQuit: forceQuit,
  });

  mainWindow.on('close', (event) => {
    if (allowClose) {
      return;
    }
    event.preventDefault();
    void requestQuit();
  });

  injector.setCurrentPageUrl(settings.startUrl);
  logger.info(`Loading start URL: ${settings.startUrl}`);
  try {
    await mainWindow.loadURL(settings.startUrl);
  } catch (error) {
    // A start URL that fails to load is not a reason to tear down the session:
    // the window is already open and its `did-fail-load` handler shows the
    // reason in place. Throwing here would race that handler and stack a second
    // error window on top of it.
    logger.warn(`Start URL did not load: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Deliberately not awaited: a slow or unreachable update server must never
  // stand between the user and their exam.
  beginUpdateCheck();

  if (options.selfTest) {
    await runSelfTest(mainWindow, userAgent);
  }
}

/**
 * Check for a newer version in the background and report it in the taskbar.
 * electron-updater applies whatever it downloads when the client quits, so a
 * running exam is never interrupted.
 */
function beginUpdateCheck(): void {
  const reason = updatesDisabled(options.noUpdate);
  if (reason !== undefined) {
    logger.info(`Skipping the update check (${reason}).`);
    return;
  }
  startUpdateCheck((status, version) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('taskbar:update', status, version);
    }
  });
}

/**
 * Verify on a real display that the browser stack works: the window exists, the
 * page finished loading, and the SEB user agent reached the page. Used by CI and
 * by `npm run smoke` to catch a client that builds but cannot actually run.
 */
async function runSelfTest(window: BrowserWindow, userAgent: string): Promise<void> {
  await waitUntilVisible(window, 10_000);

  const title = window.webContents.getTitle();
  const reportedUserAgent = String(await window.webContents.executeJavaScript('navigator.userAgent'));
  const visible = window.isVisible();

  console.log(`Self test  : window=${visible ? 'visible' : 'hidden'}`);
  console.log(`Self test  : title=${title}`);
  console.log(`Self test  : navigator.userAgent=${reportedUserAgent}`);

  const failures: string[] = [];
  if (!visible) {
    failures.push('the window never became visible');
  }
  if (!reportedUserAgent.includes('SEB/')) {
    failures.push('the SEB token is missing from the user agent');
  }
  if (reportedUserAgent !== userAgent) {
    failures.push('the configured user agent did not reach the page');
  }

  allowClose = true;

  if (failures.length > 0) {
    console.error(`Self test  : FAILED (${failures.join('; ')})`);
    app.exit(1);
    return;
  }

  console.log('Self test  : OK');
  app.exit(0);
}

/** Resolve once the window is actually on screen, or after the timeout. */
function waitUntilVisible(window: BrowserWindow, timeoutMs: number): Promise<void> {
  if (window.isVisible()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeListener('show', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    window.once('show', done);
  });
}

/**
 * Unconditional exit. Bypasses the configuration's quit password on purpose:
 * being unable to leave an application that has taken over the screen is a
 * safety problem, and quitting ends the exam session openly rather than
 * granting any hidden advantage.
 */
function forceQuit(): void {
  logger.warn('Emergency exit requested; ending the session.');
  allowClose = true;
  app.quit();
}

async function requestQuit(): Promise<void> {
  if (!mainWindow || !configuration) {
    return;
  }
  const { settings } = configuration;

  if (!settings.allowQuit) {
    logger.warn('Quitting is disabled by the configuration.');
    return;
  }

  if (settings.quitPasswordHash.length > 0) {
    const granted = await askForQuitPassword(mainWindow, settings.quitPasswordHash);
    if (!granted) {
      return;
    }
  }

  allowClose = true;
  logger.info('Ending exam session.');
  app.quit();
}

app.on('second-instance', () => {
  // Surface whichever window this instance has, so a second launch never looks
  // like a no-op. The exam window takes precedence when one exists.
  const target = mainWindow ?? BrowserWindow.getAllWindows()[0];
  if (target) {
    if (target.isMinimized()) {
      target.restore();
    }
    target.show();
    target.focus();
  }
});

app.on('window-all-closed', () => {
  if (!startupFinished) {
    return;
  }
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Deny every permission request unless the configuration opts in.
function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['fullscreen', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });
}

app.whenReady().then(async () => {
  if (options.install || options.uninstall) {
    return;
  }
  hardenSession();
  // Backstop for the emergency exit: `before-input-event` only fires while the
  // renderer is responsive and focused, so register the same combination at the
  // application level too.
  if (!globalShortcut.register(EMERGENCY_QUIT_ACCELERATOR, forceQuit)) {
    logger.warn(`Could not register the emergency exit shortcut (${EMERGENCY_QUIT_ACCELERATOR}).`);
  }
  // Same reasoning for window recovery: if the renderer is wedged, the
  // in-page handler never runs, and that is precisely when it is needed.
  if (!globalShortcut.register(RECOVER_ACCELERATOR, () => mainWindow && recoverWindow(mainWindow))) {
    logger.warn(`Could not register the window recovery shortcut (${RECOVER_ACCELERATOR}).`);
  }
  try {
    await startSession();
    startupFinished = true;
  } catch (error) {
    logger.error('Failed to start the exam session.', error);
    if (!options.verify) {
      const fallback = new BrowserWindow({
        width: 760,
        height: 520,
        title: 'Safe Exam Browser for Linux',
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      // Surface the real reason on the page: without it the screen looks like
      // "no configuration given" even when the actual failure was a download
      // error, an unreadable file, or an unreachable start URL.
      const reason = error instanceof Error ? error.message : String(error);
      await fallback.loadFile(join(__dirname, '..', 'renderer', 'error.html'));
      // The page keeps a strict `default-src 'none'` CSP, which blocks inline
      // scripts, so fill in the details from the main process instead. Values
      // are JSON-encoded and assigned via textContent, never parsed as markup.
      await fallback.webContents.executeJavaScript(
        `(() => {
           const set = (id, text) => {
             const el = document.getElementById(id);
             if (el && text) { el.textContent = text; el.hidden = false; }
           };
           set('reason', ${JSON.stringify(reason)});
           set('source', ${JSON.stringify(options.source ? `Configuration: ${options.source}` : '')});
         })();`,
      );
    } else {
      app.exit(1);
    }
  } finally {
    startupFinished = true;
  }
});

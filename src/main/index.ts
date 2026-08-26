import { app, BrowserWindow, session } from 'electron';
import { join } from 'node:path';
import { RequestFilter } from '../core/browser/urlFilter';
import { buildUserAgent } from '../core/browser/userAgent';
import { computeBrowserExamKey } from '../core/crypto/browserExamKey';
import { parseArgs, usage, userArgs } from './cli';
import { SebHeaderInjector } from './headers';
import { createKioskWindow } from './kioskWindow';
import { loadConfiguration, type LoadedConfiguration } from './loadConfig';
import { logger } from './logger';
import { askForQuitPassword } from './quitPrompt';

const options = parseArgs(userArgs(process.argv, app.isPackaged));

if (options.verbose) {
  logger.setLevel('debug');
}

if (options.help) {
  console.log(usage());
  app.exit(0);
}

// A single instance only: a second launch must not create an escape hatch out of
// a running exam session.
if (!app.requestSingleInstanceLock()) {
  logger.error('Another instance is already running.');
  app.exit(1);
}

let mainWindow: BrowserWindow | undefined;
let configuration: LoadedConfiguration | undefined;
let allowClose = false;

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
    onNavigate: (url) => injector.setCurrentPageUrl(url),
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
  await mainWindow.loadURL(settings.startUrl);

  if (options.selfTest) {
    await runSelfTest(mainWindow, userAgent);
  }
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
  mainWindow?.focus();
});

app.on('window-all-closed', () => {
  app.quit();
});

// Deny every permission request unless the configuration opts in.
function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['fullscreen', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });
}

app.whenReady().then(async () => {
  hardenSession();
  try {
    await startSession();
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
  }
});

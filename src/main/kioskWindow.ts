import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { BrowserWindow, ipcMain, shell, WebContentsView, type WebContents } from 'electron';
import type { AppSettings } from '../core/config/appSettings';
import { RequestFilter } from '../core/browser/urlFilter';
import { installKeyboardLockdown } from './lockdown';
import { logger } from './logger';

/**
 * The exam window.
 *
 * The window itself renders the taskbar — the strip along the bottom edge that
 * the reference client shows — while the exam page lives in a separate
 * WebContentsView above it. Keeping them apart matters: the exam page cannot
 * paint over the taskbar, restyle it, or reach its controls, and the taskbar
 * survives every navigation the page makes.
 */

const run = promisify(execFile);

export interface KioskWindowOptions {
  settings: AppSettings;
  userAgent: string;
  filter?: RequestFilter;
  kiosk: boolean;
  /** Do not pin the window above everything, and let Alt+Tab through. */
  allowSwitching: boolean;
  onNavigate(url: string): void;
  /** Invoked by the emergency exit combination; always ends the session. */
  onEmergencyQuit(): void;
  /** Invoked by the taskbar's quit button; goes through the normal quit flow. */
  onQuitRequested(): void;
}

export interface ExamWindow {
  window: BrowserWindow;
  /** The exam page. Load URLs and read state here, not on window.webContents. */
  contents: WebContents;
}

/**
 * The current keyboard layout, for the taskbar indicator.
 *
 * There is no portable way to ask for this: setxkbmap speaks to the X server,
 * so it answers under X11 and under XWayland, but not in a native Wayland
 * session. An empty result simply hides the indicator.
 */
async function detectInputLanguage(): Promise<string> {
  try {
    const { stdout } = await run('setxkbmap', ['-query']);
    const match = stdout.match(/^layout:\s*(\S+)/m);
    return match?.[1]?.split(',')[0] ?? '';
  } catch {
    logger.debug('Could not determine the keyboard layout; hiding the indicator.');
    return '';
  }
}

export function createKioskWindow(options: KioskWindowOptions): ExamWindow {
  const { settings, userAgent, filter, kiosk, allowSwitching } = options;
  const taskbar = settings.taskbar;
  const barHeight = taskbar.show ? taskbar.height : 0;

  const window = new BrowserWindow({
    show: false,
    kiosk,
    fullscreen: kiosk && settings.window.fullscreen,
    alwaysOnTop: kiosk && !allowSwitching,
    minimizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#1c1f26',
    title: 'Safe Exam Browser for Linux',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'taskbar.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.setMenuBarVisibility(false);
  if (kiosk && !allowSwitching) {
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: settings.allowSpellCheck,
      devTools: settings.keyboard.enableDeveloperConsole,
    },
  });
  const contents = view.webContents;

  window.contentView.addChildView(view);
  contents.setUserAgent(userAgent);

  const layoutView = (): void => {
    // getContentSize returns a tuple, but noUncheckedIndexedAccess widens the
    // elements to possibly-undefined; fall back rather than assert.
    const [width = 0, height = 0] = window.getContentSize();
    view.setBounds({ x: 0, y: 0, width, height: Math.max(0, height - barHeight) });
  };
  layoutView();
  window.on('resize', layoutView);
  window.on('enter-full-screen', layoutView);
  window.on('leave-full-screen', layoutView);

  installKeyboardLockdown(contents, keyboardFor(settings, allowSwitching), options.onEmergencyQuit, () =>
    recoverWindow(window),
  );

  registerTaskbarHandlers(window, contents, settings, options.onQuitRequested);

  // Never let the exam session spawn uncontrolled windows or hand URLs to the
  // desktop's default browser.
  contents.setWindowOpenHandler(({ url }) => {
    logger.debug(`Blocked popup: ${url}`);
    if (filter && filter.process({ url }) === 'allow') {
      contents.loadURL(url);
    }
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (filter && filter.process({ url }) === 'block') {
      logger.warn(`Blocked navigation by URL filter: ${url}`);
      event.preventDefault();
      return;
    }
    options.onNavigate(url);
  });

  contents.on('did-navigate', (_event, url) => {
    options.onNavigate(url);
  });

  contents.on('render-process-gone', (_event, details) => {
    logger.error(`Renderer process gone: ${details.reason}`);
  });

  // Keep external protocol handlers from escaping the lockdown.
  contents.on('will-frame-navigate', (event) => {
    const url = event.url;
    if (!/^(https?|about|data|blob|file):/i.test(url)) {
      logger.warn(`Blocked external protocol navigation: ${url}`);
      event.preventDefault();
    }
  });

  // Explicitly disable opening links in the system browser.
  shell.openExternal = async () => {
    logger.warn('Blocked attempt to open an external application.');
  };

  // A failed page load must be visible in the window, not just in a log nobody
  // is reading. `did-fail-load` also fires for aborted sub-frame loads, so only
  // report failures of the main frame.
  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* ERR_ABORTED, e.g. a redirect */) {
      return;
    }
    logger.error(`Failed to load ${validatedUrl}: ${errorDescription} (${errorCode})`);
    void showLoadFailure(contents, validatedUrl, errorDescription, errorCode);
  });

  // Load the taskbar shell before showing anything, so the strip is painted
  // rather than appearing a moment after the exam page.
  void window.webContents.loadFile(join(__dirname, '..', 'renderer', 'taskbar.html')).catch((error) => {
    logger.error('Could not load the taskbar.', error);
  });

  // Show the window immediately rather than waiting for `ready-to-show`. A slow
  // or hanging start URL would otherwise leave the user staring at an empty
  // desktop with no feedback at all, which is indistinguishable from the client
  // failing to launch.
  window.show();
  window.focus();
  window.once('ready-to-show', () => {
    window.focus();
  });

  return { window, contents };
}

function keyboardFor(settings: AppSettings, allowSwitching: boolean): AppSettings['keyboard'] {
  return allowSwitching
    ? // Alt+Tab is a window-manager shortcut; intercepting it only makes the
      // window harder to escape from without making the session more secure.
      { ...settings.keyboard, enableAltTab: true }
    : settings.keyboard;
}

/**
 * Wire the taskbar's controls. The channels are scoped to this window's id so a
 * stale handler from an earlier session cannot drive a new one.
 */
function registerTaskbarHandlers(
  window: BrowserWindow,
  contents: WebContents,
  settings: AppSettings,
  onQuitRequested: () => void,
): void {
  const taskbar = settings.taskbar;

  ipcMain.handle('taskbar:state', async () => ({
    show: taskbar.show,
    showQuit: settings.allowQuit,
    // A reload button is pointless when the configuration forbids reloading.
    showReload: taskbar.showReloadButton && settings.window.allowReload,
    showTime: taskbar.showTime,
    showInputLanguage: taskbar.showInputLanguage,
    height: taskbar.height,
    inputLanguage: taskbar.showInputLanguage ? await detectInputLanguage() : '',
  }));

  ipcMain.handle('taskbar:quit', () => {
    onQuitRequested();
  });

  ipcMain.handle('taskbar:reload', () => {
    if (!settings.window.allowReload) {
      logger.warn('Reload requested but disabled by the configuration.');
      return;
    }
    contents.reload();
  });

  window.on('closed', () => {
    ipcMain.removeHandler('taskbar:state');
    ipcMain.removeHandler('taskbar:quit');
    ipcMain.removeHandler('taskbar:reload');
  });
}

/**
 * Render a load failure inside the exam view. Uses a data URL so it works
 * without touching the packaged renderer assets, and escapes every interpolated
 * value so a hostile URL cannot inject markup.
 */
async function showLoadFailure(
  contents: WebContents,
  url: string,
  description: string,
  code: number,
): Promise<void> {
  const escape = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const html = `<!doctype html><meta charset="utf-8">
<style>
  body { background:#1c1f26; color:#e2e8f0; font-family:system-ui,sans-serif;
         display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
  .box { max-width:640px; text-align:center; padding:32px; }
  h1 { font-size:22px; margin:0 0 16px; }
  .err { background:rgba(248,113,113,.12); border:1px solid rgba(248,113,113,.35);
         color:#fca5a5; border-radius:8px; padding:12px 16px; font-family:ui-monospace,monospace;
         font-size:14px; text-align:left; word-break:break-word; }
  .url { color:#94a3b8; font-size:13px; word-break:break-all; margin-top:12px; }
</style>
<div class="box">
  <h1>The exam page could not be loaded</h1>
  <p class="err">${escape(description)} (${code})</p>
  <p class="url">${escape(url)}</p>
  <p class="url">Check your network connection, then start the client again.</p>
</div>`;

  try {
    await contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  } catch (error) {
    logger.error('Could not display the load failure page.', error);
  }
}

/**
 * Push the exam window out of the way without ending the session.
 *
 * Dropping always-on-top first matters: a window pinned above everything else
 * can otherwise reclaim the screen the moment it is restored, which is exactly
 * the situation this is meant to rescue the user from.
 */
export function recoverWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return;
  }
  logger.warn('Window recovery requested; releasing the screen.');
  window.setAlwaysOnTop(false);
  window.setVisibleOnAllWorkspaces(false);
  if (window.isFullScreen()) {
    window.setFullScreen(false);
  }
  window.setKiosk(false);
  window.minimize();
  // Some window managers ignore programmatic minimise. Dropping focus as well
  // means the desktop is still reachable when that happens.
  window.blur();
}

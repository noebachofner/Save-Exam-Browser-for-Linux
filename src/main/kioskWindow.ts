import { BrowserWindow, shell } from 'electron';
import type { AppSettings } from '../core/config/appSettings';
import { RequestFilter } from '../core/browser/urlFilter';
import { installKeyboardLockdown } from './lockdown';
import { logger } from './logger';

/**
 * The exam window.
 *
 * The exam page is loaded directly as the window's content, with no chrome of
 * our own: a self-drawn toolbar is an immediate tell that this is not the
 * official client, so there is deliberately none. Leaving the session is done
 * with the emergency exit (Ctrl+Shift+Q), or by closing the window, which runs
 * the configured quit flow.
 */

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
}

export function createKioskWindow(options: KioskWindowOptions): BrowserWindow {
  const { settings, userAgent, filter, kiosk, allowSwitching } = options;

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: settings.allowSpellCheck,
      devTools: settings.keyboard.enableDeveloperConsole,
    },
  });

  window.setMenuBarVisibility(false);
  if (kiosk && !allowSwitching) {
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  window.webContents.setUserAgent(userAgent);
  installKeyboardLockdown(
    window.webContents,
    keyboardFor(settings, allowSwitching),
    options.onEmergencyQuit,
    () => recoverWindow(window),
  );

  // Never let the exam session spawn uncontrolled windows or hand URLs to the
  // desktop's default browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    logger.debug(`Blocked popup: ${url}`);
    if (filter && filter.process({ url }) === 'allow') {
      window.webContents.loadURL(url);
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (filter && filter.process({ url }) === 'block') {
      logger.warn(`Blocked navigation by URL filter: ${url}`);
      event.preventDefault();
      return;
    }
    options.onNavigate(url);
  });

  window.webContents.on('did-navigate', (_event, url) => {
    options.onNavigate(url);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    logger.error(`Renderer process gone: ${details.reason}`);
  });

  // Keep external protocol handlers from escaping the lockdown.
  window.webContents.on('will-frame-navigate', (event) => {
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
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* ERR_ABORTED, e.g. a redirect */) {
      return;
    }
    logger.error(`Failed to load ${validatedUrl}: ${errorDescription} (${errorCode})`);
    void showLoadFailure(window, validatedUrl, errorDescription, errorCode);
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

  return window;
}

function keyboardFor(settings: AppSettings, allowSwitching: boolean): AppSettings['keyboard'] {
  return allowSwitching
    ? // Alt+Tab is a window-manager shortcut; intercepting it only makes the
      // window harder to escape from without making the session more secure.
      { ...settings.keyboard, enableAltTab: true }
    : settings.keyboard;
}

/**
 * Render a load failure inside the exam window. Uses a data URL so it works
 * without touching the packaged renderer assets, and escapes every interpolated
 * value so a hostile URL cannot inject markup.
 */
async function showLoadFailure(
  window: BrowserWindow,
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
    await window.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
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

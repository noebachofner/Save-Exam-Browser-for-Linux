import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import type { AppSettings } from '../core/config/appSettings';
import { RequestFilter } from '../core/browser/urlFilter';
import { installKeyboardLockdown } from './lockdown';
import { logger } from './logger';

export interface KioskWindowOptions {
  settings: AppSettings;
  userAgent: string;
  filter?: RequestFilter;
  kiosk: boolean;
  onNavigate(url: string): void;
}

export function createKioskWindow(options: KioskWindowOptions): BrowserWindow {
  const { settings, userAgent, filter, kiosk } = options;

  const window = new BrowserWindow({
    show: false,
    kiosk,
    fullscreen: kiosk && settings.window.fullscreen,
    alwaysOnTop: kiosk,
    autoHideMenuBar: true,
    backgroundColor: '#1c1f26',
    title: 'Safe Exam Browser for Linux',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: settings.allowSpellCheck,
      devTools: settings.keyboard.enableDeveloperConsole,
    },
  });

  window.setMenuBarVisibility(false);
  if (kiosk) {
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  window.webContents.setUserAgent(userAgent);
  installKeyboardLockdown(window, settings.keyboard);

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

  window.once('ready-to-show', () => {
    window.show();
    window.focus();
  });

  return window;
}

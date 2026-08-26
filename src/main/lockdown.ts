import type { BrowserWindow, Input } from 'electron';
import type { KeyboardSettings } from '../core/config/appSettings';

/**
 * Keyboard lockdown.
 *
 * Blocks the shortcuts a .seb configuration disables. This is enforced inside
 * the browser window only — unlike the Windows client, a Linux user-space
 * application cannot intercept window-manager level shortcuts. See
 * docs/COMPATIBILITY.md for what this does and does not guarantee.
 */

const DEVTOOLS_KEYS = new Set(['I', 'J', 'C']);

export function shouldBlockInput(input: Input, settings: KeyboardSettings): boolean {
  const key = input.key;

  if (input.type !== 'keyDown') {
    return false;
  }

  // Developer tools: F12 and Ctrl+Shift+I/J/C
  if (!settings.enableDeveloperConsole) {
    if (key === 'F12') {
      return true;
    }
    if (input.control && input.shift && DEVTOOLS_KEYS.has(key.toUpperCase())) {
      return true;
    }
    if (input.control && key.toLowerCase() === 'u') {
      return true; // view-source
    }
  }

  if (!settings.enableEsc && key === 'Escape') {
    return true;
  }

  if (!settings.enableF1toF12 && /^F([1-9]|1[0-2])$/.test(key)) {
    return true;
  }

  if (!settings.enablePrintScreen && key === 'PrintScreen') {
    return true;
  }

  if (!settings.enableAltTab && input.alt && key === 'Tab') {
    return true;
  }

  // Window/tab management that would break out of the exam session.
  if (input.control && ['n', 't', 'w', 'p', 'r'].includes(key.toLowerCase())) {
    return true;
  }
  if (input.alt && ['F4', 'ArrowLeft', 'ArrowRight', 'Home'].includes(key)) {
    return true;
  }

  return false;
}

export function installKeyboardLockdown(window: BrowserWindow, settings: KeyboardSettings): void {
  window.webContents.on('before-input-event', (event, input) => {
    if (shouldBlockInput(input, settings)) {
      event.preventDefault();
    }
  });

  if (!settings.enableRightMouse) {
    window.webContents.on('context-menu', (event) => {
      event.preventDefault();
    });
  }
}

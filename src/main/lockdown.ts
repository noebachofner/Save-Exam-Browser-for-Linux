import type { Input, WebContents } from 'electron';
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

/**
 * The emergency exit combination. Deliberately awkward to hit by accident, and
 * never blocked by the lockdown rules above.
 */
export const EMERGENCY_QUIT_ACCELERATOR = 'Control+Shift+Q';

/**
 * Pushes the exam window out of the way without ending the session. A
 * fullscreen always-on-top window that a misbehaving window manager will not
 * let go of otherwise leaves the machine unusable, and killing the session is
 * too blunt a remedy for a desktop glitch.
 */
export const RECOVER_ACCELERATOR = 'Control+Shift+M';

/** True when the input is the window-recovery combination. */
export function isRecoverWindow(input: Input): boolean {
  return input.type === 'keyDown' && input.control && input.shift && input.key.toUpperCase() === 'M';
}

/** True when the input is the emergency exit combination. */
export function isEmergencyQuit(input: Input): boolean {
  return input.type === 'keyDown' && input.control && input.shift && input.key.toUpperCase() === 'Q';
}

export function installKeyboardLockdown(
  contents: WebContents,
  settings: KeyboardSettings,
  onEmergencyQuit?: () => void,
  onRecoverWindow?: () => void,
): void {
  contents.on('before-input-event', (event, input) => {
    // Checked before every block rule: a user must never be trapped inside an
    // application running on their own machine.
    if (onEmergencyQuit && isEmergencyQuit(input)) {
      event.preventDefault();
      onEmergencyQuit();
      return;
    }
    if (onRecoverWindow && isRecoverWindow(input)) {
      event.preventDefault();
      onRecoverWindow();
      return;
    }
    if (shouldBlockInput(input, settings)) {
      event.preventDefault();
    }
  });

  if (!settings.enableRightMouse) {
    contents.on('context-menu', (event) => {
      event.preventDefault();
    });
  }
}

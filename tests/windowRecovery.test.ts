import type { Input } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isEmergencyQuit, isRecoverWindow, shouldBlockInput } from '../src/main/lockdown';
import type { KeyboardSettings } from '../src/core/config/appSettings';

const input = (over: Partial<Input>): Input =>
  ({ type: 'keyDown', key: '', control: false, shift: false, alt: false, meta: false, ...over }) as Input;

const lockedDown: KeyboardSettings = {
  enableEsc: false,
  enableF1toF12: false,
  enablePrintScreen: false,
  enableAltTab: false,
  enableRightMouse: false,
  enableDeveloperConsole: false,
};

describe('window recovery', () => {
  it('recognises Ctrl+Shift+M', () => {
    expect(isRecoverWindow(input({ key: 'M', control: true, shift: true }))).toBe(true);
    expect(isRecoverWindow(input({ key: 'm', control: true, shift: true }))).toBe(true);
  });

  it('is distinct from the emergency exit', () => {
    const recover = input({ key: 'M', control: true, shift: true });
    const quit = input({ key: 'Q', control: true, shift: true });
    expect(isEmergencyQuit(recover)).toBe(false);
    expect(isRecoverWindow(quit)).toBe(false);
  });

  it('stays reachable under the most restrictive lockdown', () => {
    const recover = input({ key: 'M', control: true, shift: true });
    expect(shouldBlockInput(recover, lockedDown)).toBe(false);
  });

  it('releases always-on-top before minimising', () => {
    // Order matters: a window pinned above everything can reclaim the screen the
    // moment it is restored, which is the very situation being rescued.
    const code = readFileSync(join(__dirname, '..', 'src', 'main', 'kioskWindow.ts'), 'utf8');
    const body = code.slice(code.indexOf('export function recoverWindow'));
    expect(body.indexOf('setAlwaysOnTop(false)')).toBeLessThan(body.indexOf('minimize()'));
  });

  it('does not pin the window when switching is allowed', () => {
    const code = readFileSync(join(__dirname, '..', 'src', 'main', 'kioskWindow.ts'), 'utf8');
    expect(code).toContain('alwaysOnTop: kiosk && !allowSwitching');
    expect(code).toContain('enableAltTab: true');
  });
});

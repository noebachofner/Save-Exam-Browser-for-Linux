import type { Input } from 'electron';
import { describe, expect, it } from 'vitest';
import { isEmergencyQuit, shouldBlockInput } from '../src/main/lockdown';
import type { KeyboardSettings } from '../src/core/config/appSettings';

const input = (over: Partial<Input>): Input =>
  ({ type: 'keyDown', key: '', control: false, shift: false, alt: false, meta: false, ...over }) as Input;

/** The most restrictive configuration a .seb file can ask for. */
const lockedDown: KeyboardSettings = {
  enableEsc: false,
  enableF1toF12: false,
  enablePrintScreen: false,
  enableAltTab: false,
  enableRightMouse: false,
  enableDeveloperConsole: false,
};

describe('emergency exit', () => {
  it('recognises Ctrl+Shift+Q', () => {
    expect(isEmergencyQuit(input({ key: 'Q', control: true, shift: true }))).toBe(true);
    expect(isEmergencyQuit(input({ key: 'q', control: true, shift: true }))).toBe(true);
  });

  it('ignores near misses, so it cannot fire by accident', () => {
    expect(isEmergencyQuit(input({ key: 'Q', control: true }))).toBe(false);
    expect(isEmergencyQuit(input({ key: 'Q', shift: true }))).toBe(false);
    expect(isEmergencyQuit(input({ key: 'W', control: true, shift: true }))).toBe(false);
    expect(isEmergencyQuit(input({ key: 'Q', control: true, shift: true, type: 'keyUp' }))).toBe(false);
  });

  it('stays reachable under the most restrictive lockdown', () => {
    // A user must never be trapped: whatever the configuration disables, the
    // exit combination must still be recognised rather than swallowed.
    const combo = input({ key: 'Q', control: true, shift: true });
    expect(isEmergencyQuit(combo)).toBe(true);
    expect(shouldBlockInput(combo, lockedDown)).toBe(false);
  });

  it('still blocks the shortcuts the configuration disables', () => {
    expect(shouldBlockInput(input({ key: 'Tab', alt: true }), lockedDown)).toBe(true);
    expect(shouldBlockInput(input({ key: 'Escape' }), lockedDown)).toBe(true);
    expect(shouldBlockInput(input({ key: 'F12' }), lockedDown)).toBe(true);
  });
});

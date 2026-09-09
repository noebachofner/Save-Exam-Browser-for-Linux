import { describe, expect, it } from 'vitest';
import { defaultSettings, mapSettings } from '../src/core/config/appSettings';
import { parsePlist } from '../src/core/config/plist';

const plist = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>${body}</dict></plist>`;

describe('taskbar settings', () => {
  it('reads the strip the reference client would show', () => {
    const raw = parsePlist(
      plist(`
        <key>showTaskBar</key><true/>
        <key>showReloadButton</key><true/>
        <key>showTime</key><true/>
        <key>showInputLanguage</key><true/>
        <key>taskBarHeight</key><integer>48</integer>
      `),
    );
    const settings = mapSettings(raw);

    expect(settings.taskbar.show).toBe(true);
    expect(settings.taskbar.height).toBe(48);
    expect(settings.taskbar.showReloadButton).toBe(true);
    expect(settings.taskbar.showTime).toBe(true);
    expect(settings.taskbar.showInputLanguage).toBe(true);
  });

  it('lets a configuration turn the strip off', () => {
    const settings = mapSettings(parsePlist(plist('<key>showTaskBar</key><false/>')));
    expect(settings.taskbar.show).toBe(false);
  });

  it('clamps a height that would swallow the page or vanish', () => {
    const tiny = mapSettings(parsePlist(plist('<key>taskBarHeight</key><integer>2</integer>')));
    const huge = mapSettings(parsePlist(plist('<key>taskBarHeight</key><integer>5000</integer>')));
    expect(tiny.taskbar.height).toBe(24);
    expect(huge.taskbar.height).toBe(120);
  });

  it('defaults to a visible strip with a clock', () => {
    const defaults = defaultSettings();
    expect(defaults.taskbar.show).toBe(true);
    expect(defaults.taskbar.showTime).toBe(true);
    expect(defaults.taskbar.height).toBeGreaterThan(0);
  });
});

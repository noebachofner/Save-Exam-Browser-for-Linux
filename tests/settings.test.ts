import { describe, expect, it } from 'vitest';
import { defaultSettings, mapSettings } from '../src/core/config/appSettings';
import { buildUserAgent, cleanBaseUserAgent, withPlatform, SEB_VERSION } from '../src/core/browser/userAgent';
import { hashPassword, verifyPassword } from '../src/core/crypto/passwordHash';
import { isSebLink, resolveSebUrl, resolveSebUrlInsecureFallback, SebUrlError } from '../src/core/net/sebUrl';
import { parseArgs, userArgs } from '../src/main/cli';

describe('settings mapping', () => {
  it('falls back to defaults for an empty configuration', () => {
    expect(mapSettings({})).toEqual(defaultSettings());
  });

  it('maps the core browser settings', () => {
    const settings = mapSettings({
      startURL: 'https://example.edu/quiz',
      quitURL: 'https://example.edu/done',
      sendBrowserExamKey: true,
      allowQuit: false,
      hashedQuitPassword: 'abc123',
    });
    expect(settings.startUrl).toBe('https://example.edu/quiz');
    expect(settings.quitUrl).toBe('https://example.edu/done');
    expect(settings.sendCustomHeaders).toBe(true);
    expect(settings.allowQuit).toBe(false);
    expect(settings.quitPasswordHash).toBe('abc123');
  });

  it('maps browserViewMode to fullscreen', () => {
    expect(mapSettings({ browserViewMode: 1 }).window.fullscreen).toBe(true);
    expect(mapSettings({ browserViewMode: 0 }).window.fullscreen).toBe(false);
  });

  it('maps URL filter rules and their actions', () => {
    const settings = mapSettings({
      URLFilterEnable: true,
      URLFilterRules: [
        { action: 1, active: true, expression: 'example.edu/*', regex: false },
        { action: 0, active: true, expression: 'example.edu/admin/*', regex: false },
      ],
    });
    expect(settings.filterEnabled).toBe(true);
    expect(settings.filterRules).toHaveLength(2);
    expect(settings.filterRules[0]?.result).toBe('allow');
    expect(settings.filterRules[1]?.result).toBe('block');
  });

  it('skips filter rules without an expression', () => {
    const settings = mapSettings({ URLFilterRules: [{ action: 1 }, { expression: 'ok.edu' }] });
    expect(settings.filterRules).toHaveLength(1);
  });

  it('reads the exam key salt as bytes', () => {
    const salt = new Uint8Array([1, 2, 3]);
    expect(mapSettings({ examKeySalt: salt }).examKeySalt).toEqual(salt);
  });

  it('ignores values of the wrong type', () => {
    expect(mapSettings({ startURL: 42 }).startUrl).toBe(defaultSettings().startUrl);
    expect(mapSettings({ allowQuit: 'yes' }).allowQuit).toBe(defaultSettings().allowQuit);
  });
});

describe('user agent', () => {
  const chrome =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

  it('appends the SEB token so exam servers recognize the client', () => {
    const ua = buildUserAgent({ baseUserAgent: chrome });
    expect(ua).toContain(`SEB/${SEB_VERSION}`);
    expect(ua.startsWith('Mozilla/5.0')).toBe(true);
  });

  it('strips the Electron token from the base user agent', () => {
    const withElectron = `${chrome} Electron/33.3.1`;
    expect(cleanBaseUserAgent(withElectron)).not.toContain('Electron');
    expect(buildUserAgent({ baseUserAgent: withElectron })).not.toContain('Electron');
  });

  it('appends a configured suffix', () => {
    expect(buildUserAgent({ baseUserAgent: chrome, suffix: 'MyUni' })).toMatch(/SEB\/[\d.]+ MyUni$/);
  });

  it('honours a full custom user agent', () => {
    const ua = buildUserAgent({ baseUserAgent: chrome, custom: 'Custom/1.0' });
    expect(ua).toBe(`Custom/1.0 SEB/${SEB_VERSION}`);
  });
});

describe('quit password', () => {
  it('verifies a correct password against its sha256 hash', () => {
    expect(verifyPassword('hunter2', hashPassword('hunter2'))).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyPassword('nope', hashPassword('hunter2'))).toBe(false);
  });

  it('is case-insensitive about the stored hash formatting', () => {
    expect(verifyPassword('hunter2', hashPassword('hunter2').toUpperCase())).toBe(true);
  });

  it('treats an empty hash as no password required', () => {
    expect(verifyPassword('', '')).toBe(true);
  });
});

describe('seb:// links', () => {
  it('maps sebs:// to https', () => {
    expect(resolveSebUrl('sebs://example.edu/exam.seb')).toBe('https://example.edu/exam.seb');
  });

  it('maps seb:// to https with an http fallback', () => {
    expect(resolveSebUrl('seb://example.edu/exam.seb')).toBe('https://example.edu/exam.seb');
    expect(resolveSebUrlInsecureFallback('seb://example.edu/exam.seb')).toBe('http://example.edu/exam.seb');
  });

  it('passes plain http(s) URLs through', () => {
    expect(resolveSebUrl('https://example.edu/exam.seb')).toBe('https://example.edu/exam.seb');
  });

  it('recognizes seb links', () => {
    expect(isSebLink('seb://x')).toBe(true);
    expect(isSebLink('sebs://x')).toBe(true);
    expect(isSebLink('https://x')).toBe(false);
  });

  it('rejects anything else', () => {
    expect(() => resolveSebUrl('ftp://example.edu/exam.seb')).toThrow(SebUrlError);
  });
});

describe('command line', () => {
  it('reads a configuration source', () => {
    expect(parseArgs(['exam.seb']).source).toBe('exam.seb');
  });

  it('reads flags', () => {
    const options = parseArgs(['--verify', '--no-kiosk', '--verbose', '--password=pw', 'exam.seb']);
    expect(options).toMatchObject({
      verify: true,
      noKiosk: true,
      verbose: true,
      password: 'pw',
      source: 'exam.seb',
    });
  });

  it('ignores unknown switches such as Chromium flags', () => {
    expect(parseArgs(['--enable-logging', 'exam.seb']).source).toBe('exam.seb');
  });

  it('strips Electron argv prefixes', () => {
    expect(userArgs(['electron', '.', 'exam.seb'], false)).toEqual(['exam.seb']);
    expect(userArgs(['/usr/bin/seb-linux', 'exam.seb'], true)).toEqual(['exam.seb']);
  });
});

describe('user agent platform token', () => {
  const chrome =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

  it('presents a Windows platform token when asked', () => {
    const ua = buildUserAgent({ baseUserAgent: chrome, platform: 'windows' });
    expect(ua).toContain('Windows NT 10.0; Win64; x64');
    expect(ua).not.toContain('X11; Linux');
    expect(ua).toContain(`SEB/${SEB_VERSION}`);
  });

  it('keeps the Linux token when asked', () => {
    expect(buildUserAgent({ baseUserAgent: chrome, platform: 'linux' })).toContain('X11; Linux x86_64');
  });

  it('leaves the base platform untouched when no platform is given', () => {
    expect(buildUserAgent({ baseUserAgent: chrome })).toContain('X11; Linux x86_64');
  });

  it('withPlatform only rewrites the first parenthesised group', () => {
    expect(withPlatform(chrome, 'windows')).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    );
  });

  it('a custom user agent overrides the platform token entirely', () => {
    expect(buildUserAgent({ baseUserAgent: chrome, platform: 'windows', custom: 'Custom/1.0' })).toBe(
      `Custom/1.0 SEB/${SEB_VERSION}`,
    );
  });
});

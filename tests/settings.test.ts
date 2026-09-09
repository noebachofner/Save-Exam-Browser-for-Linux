import { describe, expect, it } from 'vitest';
import { defaultSettings, mapSettings } from '../src/core/config/appSettings';
import { buildUserAgent, chromiumVersionOf, SEB_VERSION } from '../src/core/browser/userAgent';
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
  // A stock Electron agent, including the app name Electron injects, which must
  // not leak into the result.
  const chrome =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) SafeExamBrowserforLinux/0.6.2 Chrome/130.0.6723.191 Electron/33.4.11 Safari/537.36';

  it('matches the Windows client byte for byte by default', () => {
    // Exactly the reference format: Windows NT 10.0 with no Win64/x64, the
    // engine's Chromium version, the SEB token, and nothing else.
    expect(buildUserAgent({ baseUserAgent: chrome })).toBe(
      `Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.191 SEB/${SEB_VERSION}`,
    );
  });

  it('leaks neither the app name nor the Electron token', () => {
    const ua = buildUserAgent({ baseUserAgent: chrome });
    expect(ua).not.toMatch(/electron/i);
    expect(ua).not.toMatch(/safeexambrowserforlinux/i);
    expect(ua).not.toMatch(/seb-linux/i);
  });

  it('reads the Chromium version from the engine', () => {
    expect(chromiumVersionOf(chrome)).toBe('130.0.6723.191');
  });

  it('appends a configured suffix after the SEB token', () => {
    expect(buildUserAgent({ baseUserAgent: chrome, suffix: 'MyUni' })).toMatch(/SEB\/[\d.]+ MyUni$/);
  });

  it('honours a full custom user agent', () => {
    expect(buildUserAgent({ baseUserAgent: chrome, custom: 'Custom/1.0' })).toBe(
      `Custom/1.0 SEB/${SEB_VERSION}`,
    );
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

  it('presents the exact Windows platform token, without Win64/x64', () => {
    const ua = buildUserAgent({ baseUserAgent: chrome, platform: 'windows' });
    expect(ua).toContain('(Windows NT 10.0)');
    expect(ua).not.toContain('Win64');
    expect(ua).not.toContain('X11; Linux');
  });

  it('can identify honestly as Linux when asked', () => {
    expect(buildUserAgent({ baseUserAgent: chrome, platform: 'linux' })).toContain('X11; Linux x86_64');
  });

  it('defaults to the Windows token when no platform is given', () => {
    expect(buildUserAgent({ baseUserAgent: chrome })).toContain('(Windows NT 10.0)');
  });

  it('a custom user agent overrides the platform token entirely', () => {
    expect(buildUserAgent({ baseUserAgent: chrome, platform: 'windows', custom: 'Custom/1.0' })).toBe(
      `Custom/1.0 SEB/${SEB_VERSION}`,
    );
  });
});

describe('client hints', () => {
  it('rewrites the platform to Windows and strips Electron from the brand list', async () => {
    const { SebHeaderInjector } = await import('../src/main/headers');
    const incoming = {
      'Sec-CH-UA': '"Chromium";v="130", "Electron";v="33", "Not?A_Brand";v="99"',
      'Sec-CH-UA-Platform': '"Linux"',
      'Sec-CH-UA-Platform-Version': '"6.18.0"',
    };
    const out = SebHeaderInjector.windowsClientHints(incoming);
    expect(out['Sec-CH-UA-Platform']).toBe('"Windows"');
    expect(out['Sec-CH-UA-Platform-Version']).toBe('"10.0.0"');
    expect(out['Sec-CH-UA']).not.toMatch(/electron/i);
    expect(out['Sec-CH-UA']).toContain('"Chromium"');
  });

  it('leaves a request that carries no client hints untouched', async () => {
    const { SebHeaderInjector } = await import('../src/main/headers');
    expect(SebHeaderInjector.windowsClientHints({ Accept: 'text/html' })).toEqual({});
  });
});

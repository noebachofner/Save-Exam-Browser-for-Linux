import { describe, expect, it } from 'vitest';
import { SebHeaderInjector } from '../src/main/headers';
import { computeConfigKeyHash } from '../src/core/crypto/configKey';
import { computeBrowserExamKeyHash } from '../src/core/crypto/browserExamKey';
import { shouldBlockInput } from '../src/main/lockdown';
import { defaultSettings } from '../src/core/config/appSettings';

const CONFIG_KEY = 'c'.repeat(64);
const BEK = 'b'.repeat(64);

function injector(overrides: Partial<ConstructorParameters<typeof SebHeaderInjector>[0]> = {}) {
  return new SebHeaderInjector({
    configKey: CONFIG_KEY,
    browserExamKey: BEK,
    sendConfigKey: true,
    sendBrowserExamKey: true,
    ...overrides,
  });
}

describe('SEB header injection', () => {
  const url = 'https://example.edu/mod/quiz/attempt.php';

  it('adds both headers to main frame requests', () => {
    const headers = injector().headersFor(url, 'mainFrame');
    expect(headers['X-SafeExamBrowser-ConfigKeyHash']).toBe(computeConfigKeyHash(CONFIG_KEY, url));
    expect(headers['X-SafeExamBrowser-RequestHash']).toBe(computeBrowserExamKeyHash(BEK, url));
  });

  it('adds headers to same-host subresources', () => {
    const inj = injector();
    inj.setCurrentPageUrl(url);
    const headers = inj.headersFor('https://example.edu/theme/styles.css', 'stylesheet');
    expect(headers['X-SafeExamBrowser-ConfigKeyHash']).toBeDefined();
  });

  it('does not add headers to third-party subresources', () => {
    const inj = injector();
    inj.setCurrentPageUrl(url);
    expect(inj.headersFor('https://cdn.other.com/x.js', 'script')).toEqual({});
  });

  it('omits the config key header when disabled', () => {
    const headers = injector({ sendConfigKey: false }).headersFor(url, 'mainFrame');
    expect(headers['X-SafeExamBrowser-ConfigKeyHash']).toBeUndefined();
    expect(headers['X-SafeExamBrowser-RequestHash']).toBeDefined();
  });

  it('omits the request hash header when no browser exam key is known', () => {
    const headers = injector({ browserExamKey: '' }).headersFor(url, 'mainFrame');
    expect(headers['X-SafeExamBrowser-RequestHash']).toBeUndefined();
  });

  it('adds nothing when both are disabled', () => {
    expect(
      injector({ sendConfigKey: false, sendBrowserExamKey: false }).headersFor(url, 'mainFrame'),
    ).toEqual({});
  });
});

describe('keyboard lockdown', () => {
  const keyboard = defaultSettings().keyboard;
  const input = (
    type: 'keyDown' | 'keyUp',
    key: string,
    mods: Partial<{ control: boolean; shift: boolean; alt: boolean }> = {},
  ) => ({ type, key, control: false, shift: false, alt: false, meta: false, ...mods }) as never;
  const down = (key: string, mods: Partial<{ control: boolean; shift: boolean; alt: boolean }> = {}) =>
    input('keyDown', key, mods);

  it('blocks the developer tools shortcuts by default', () => {
    expect(shouldBlockInput(down('F12'), keyboard)).toBe(true);
    expect(shouldBlockInput(down('I', { control: true, shift: true }), keyboard)).toBe(true);
    expect(shouldBlockInput(down('u', { control: true }), keyboard)).toBe(true);
  });

  it('allows developer tools when the configuration enables them', () => {
    const enabled = { ...keyboard, enableDeveloperConsole: true, enableF1toF12: true };
    expect(shouldBlockInput(down('F12'), enabled)).toBe(false);
  });

  it('blocks Escape and function keys by default', () => {
    expect(shouldBlockInput(down('Escape'), keyboard)).toBe(true);
    expect(shouldBlockInput(down('F5'), keyboard)).toBe(true);
  });

  it('blocks new window, tab and print shortcuts', () => {
    for (const key of ['n', 't', 'w', 'p', 'r']) {
      expect(shouldBlockInput(down(key, { control: true }), keyboard)).toBe(true);
    }
  });

  it('blocks Alt+F4 and history navigation', () => {
    expect(shouldBlockInput(down('F4', { alt: true }), keyboard)).toBe(true);
    expect(shouldBlockInput(down('ArrowLeft', { alt: true }), keyboard)).toBe(true);
  });

  it('lets ordinary typing through', () => {
    expect(shouldBlockInput(down('a'), keyboard)).toBe(false);
    expect(shouldBlockInput(down('Enter'), keyboard)).toBe(false);
  });

  it('ignores key-up events', () => {
    expect(shouldBlockInput(input('keyUp', 'Escape'), keyboard)).toBe(false);
  });
});

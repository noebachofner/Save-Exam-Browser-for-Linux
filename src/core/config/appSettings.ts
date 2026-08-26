import type { SebValue } from '../crypto/canonicalJson';
import type { FilterResult, FilterRuleSettings } from '../browser/urlFilter';

/**
 * Typed view over the raw .seb configuration dictionary.
 *
 * Only the settings that the Linux client can actually honour are mapped. Keys
 * that describe Windows-specific lockdown (registry policies, explorer shell,
 * process whitelists) are deliberately not mapped — see docs/COMPATIBILITY.md.
 */

export interface WindowSettings {
  /** browserViewMode: 0 = window, 1 = fullscreen. */
  fullscreen: boolean;
  showToolbar: boolean;
  allowNavigation: boolean;
  allowReload: boolean;
  showReloadButton: boolean;
}

export interface KeyboardSettings {
  enableEsc: boolean;
  enableF1toF12: boolean;
  enablePrintScreen: boolean;
  enableAltTab: boolean;
  enableRightMouse: boolean;
  enableDeveloperConsole: boolean;
}

export interface AppSettings {
  startUrl: string;
  quitUrl: string;
  quitUrlConfirm: boolean;
  allowQuit: boolean;
  quitPasswordHash: string;
  adminPasswordHash: string;

  /** When true, send both X-SafeExamBrowser-* headers. */
  sendCustomHeaders: boolean;
  /** Explicitly configured Browser Exam Key, if the configuration carries one. */
  browserExamKey: string;
  examKeySalt: Uint8Array;

  userAgentSuffix: string;
  customUserAgent: string;

  allowDownloads: boolean;
  allowUploads: boolean;
  allowSpellCheck: boolean;

  window: WindowSettings;
  keyboard: KeyboardSettings;

  filterEnabled: boolean;
  filterContentRequests: boolean;
  filterDefault: FilterResult;
  filterRules: FilterRuleSettings[];
}

function asBoolean(value: SebValue | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: SebValue | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: SebValue | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBytes(value: SebValue | undefined): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(0);
}

function mapFilterRules(value: SebValue | undefined): FilterRuleSettings[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rules: FilterRuleSettings[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry) || entry instanceof Uint8Array) {
      continue;
    }
    const expression = asString(entry['expression'], '');
    if (expression.length === 0) {
      continue;
    }
    rules.push({
      expression,
      // action: 0 = block, 1 = allow
      result: asNumber(entry['action'], 0) === 1 ? 'allow' : 'block',
      regex: asBoolean(entry['regex'], false),
      active: asBoolean(entry['active'], true),
    });
  }
  return rules;
}

/** Default settings, mirroring the reference client's DataValues defaults. */
export function defaultSettings(): AppSettings {
  return {
    startUrl: 'https://www.safeexambrowser.org/start',
    quitUrl: '',
    quitUrlConfirm: true,
    allowQuit: true,
    quitPasswordHash: '',
    adminPasswordHash: '',
    sendCustomHeaders: false,
    browserExamKey: '',
    examKeySalt: new Uint8Array(0),
    userAgentSuffix: '',
    customUserAgent: '',
    allowDownloads: false,
    allowUploads: false,
    allowSpellCheck: false,
    window: {
      fullscreen: true,
      showToolbar: false,
      allowNavigation: false,
      allowReload: false,
      showReloadButton: false,
    },
    keyboard: {
      enableEsc: false,
      enableF1toF12: false,
      enablePrintScreen: false,
      enableAltTab: false,
      enableRightMouse: false,
      enableDeveloperConsole: false,
    },
    filterEnabled: false,
    filterContentRequests: false,
    filterDefault: 'block',
    filterRules: [],
  };
}

/** Map a raw .seb configuration dictionary onto typed application settings. */
export function mapSettings(raw: { [key: string]: SebValue }): AppSettings {
  const defaults = defaultSettings();
  const sendCustomHeaders = asBoolean(raw['sendBrowserExamKey'], defaults.sendCustomHeaders);

  return {
    startUrl: asString(raw['startURL'], defaults.startUrl),
    quitUrl: asString(raw['quitURL'], defaults.quitUrl),
    quitUrlConfirm: asBoolean(raw['quitURLConfirm'], defaults.quitUrlConfirm),
    allowQuit: asBoolean(raw['allowQuit'], defaults.allowQuit),
    quitPasswordHash: asString(raw['hashedQuitPassword'], defaults.quitPasswordHash),
    adminPasswordHash: asString(raw['hashedAdminPassword'], defaults.adminPasswordHash),

    sendCustomHeaders,
    browserExamKey: asString(raw['browserExamKey'], defaults.browserExamKey),
    examKeySalt: asBytes(raw['examKeySalt']),

    userAgentSuffix: asString(raw['browserUserAgent'], defaults.userAgentSuffix),
    customUserAgent: asString(raw['browserUserAgentWinDesktopModeCustom'], defaults.customUserAgent),

    allowDownloads: asBoolean(raw['allowDownloads'], defaults.allowDownloads),
    allowUploads: asBoolean(raw['allowUploads'], defaults.allowUploads),
    allowSpellCheck: asBoolean(raw['allowSpellCheck'], defaults.allowSpellCheck),

    window: {
      fullscreen: asNumber(raw['browserViewMode'], 1) === 1,
      showToolbar: asBoolean(raw['enableBrowserWindowToolbar'], defaults.window.showToolbar),
      allowNavigation: asBoolean(raw['allowBrowsingBackForward'], defaults.window.allowNavigation),
      allowReload: asBoolean(raw['browserWindowAllowReload'], defaults.window.allowReload),
      showReloadButton: asBoolean(raw['showReloadButton'], defaults.window.showReloadButton),
    },

    keyboard: {
      enableEsc: asBoolean(raw['enableEsc'], defaults.keyboard.enableEsc),
      enableF1toF12: asBoolean(raw['enableF5'], defaults.keyboard.enableF1toF12),
      enablePrintScreen: asBoolean(raw['enablePrintScreen'], defaults.keyboard.enablePrintScreen),
      enableAltTab: asBoolean(raw['enableAltTab'], defaults.keyboard.enableAltTab),
      enableRightMouse: asBoolean(raw['enableRightMouse'], defaults.keyboard.enableRightMouse),
      enableDeveloperConsole: asBoolean(
        raw['allowDeveloperConsole'],
        defaults.keyboard.enableDeveloperConsole,
      ),
    },

    filterEnabled: asBoolean(raw['URLFilterEnable'], defaults.filterEnabled),
    filterContentRequests: asBoolean(raw['URLFilterEnableContentFilter'], defaults.filterContentRequests),
    filterDefault: defaults.filterDefault,
    filterRules: mapFilterRules(raw['URLFilterRules']),
  };
}

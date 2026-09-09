/**
 * User agent construction.
 *
 * The string is assembled to match the official Windows client byte for byte,
 * because an exam server identifies a Safe Exam Browser session in part by it —
 * the Moodle access rule looks for the `SEB` token — and anything that deviates
 * (an app name, a `Win64; x64` that the reference omits, a platform that reads
 * Linux) is a way to tell this client apart from the Windows one.
 *
 * Reference: SafeExamBrowser.Browser/Responsibilities/Browser/
 * ConfigurationResponsibility.cs (InitializeUserAgent), which builds:
 *   Mozilla/5.0 (Windows NT {major}.{minor}) AppleWebKit/537.36 (KHTML, like
 *   Gecko) Chrome/{ChromiumVersion} SEB/{version}
 * with no Win64/x64 token and no application name.
 *
 * The platform token and SEB version have no bearing on the Config Key or
 * Browser Exam Key, which are what an exam server verifies cryptographically —
 * this only governs how the client identifies itself.
 */

/**
 * SEB version presented in the token. Matches a real Windows SEB release rather
 * than an internal version, so it is indistinguishable from the reference.
 */
export const SEB_VERSION = '3.9.0';

/**
 * Chromium version used when it cannot be read from the engine. Kept in step
 * with the bundled Electron's Chromium so the value stays internally consistent
 * with the engine actually rendering the page.
 */
const FALLBACK_CHROMIUM_VERSION = '130.0.6723.191';

/** Platform token presented in the user agent. */
export type UserAgentPlatform = 'windows' | 'linux';

/**
 * The platform tokens. The Windows token is exactly what the reference emits —
 * `Windows NT 10.0`, without the `Win64; x64` that a stock Chromium would add.
 */
const PLATFORM_TOKENS: Record<UserAgentPlatform, string> = {
  windows: 'Windows NT 10.0',
  linux: 'X11; Linux x86_64',
};

export interface UserAgentOptions {
  /** Chromium user agent of the underlying engine, used to read its version. */
  baseUserAgent: string;
  /** Platform token to present. Defaults to windows. */
  platform?: UserAgentPlatform;
  /** Value of the `browserUserAgent` config key, appended if set. */
  suffix?: string;
  /** Full replacement from `browserUserAgentWinDesktopModeCustom`, if set. */
  custom?: string;
}

/** Read the Chromium version out of a Chromium user agent, e.g. "130.0.6723.191". */
export function chromiumVersionOf(userAgent: string): string {
  const match = userAgent.match(/Chrome\/([\d.]+)/i);
  return match?.[1] ?? FALLBACK_CHROMIUM_VERSION;
}

export function buildUserAgent(options: UserAgentOptions): string {
  const sebToken = `SEB/${SEB_VERSION}`;

  // A configuration can replace the whole agent; the reference honours this too.
  if (options.custom && options.custom.trim().length > 0) {
    return `${options.custom.trim()} ${sebToken}`;
  }

  const platform = PLATFORM_TOKENS[options.platform ?? 'windows'];
  const chromium = chromiumVersionOf(options.baseUserAgent);
  const base = `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromium} ${sebToken}`;

  const suffix = options.suffix?.trim();
  return suffix && suffix.length > 0 ? `${base} ${suffix}` : base;
}

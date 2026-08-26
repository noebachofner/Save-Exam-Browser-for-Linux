/**
 * User agent construction.
 *
 * Exam servers identify a Safe Exam Browser session partly by the `SEB` token in
 * the User-Agent string — the Moodle access rule, for example, looks for it. A
 * client that does not carry the token is not recognized as SEB at all, so every
 * SEB client (Windows, macOS, iOS) appends its own SEB suffix.
 *
 * The platform token is configurable. .seb configurations themselves carry user
 * agent overrides (`browserUserAgent`, `browserUserAgentWinDesktopModeCustom`),
 * so presenting a chosen platform string is part of the format rather than a
 * trick — but note that the platform token is only an identification string. It
 * has no bearing on the Config Key or Browser Exam Key, which are what an exam
 * server actually verifies cryptographically.
 */

/** SEB protocol version this client implements compatibility for. */
export const SEB_VERSION = '3.9.0';

/** Platform token presented in the user agent. */
export type UserAgentPlatform = 'windows' | 'linux';

const PLATFORM_TOKENS: Record<UserAgentPlatform, string> = {
  windows: 'Windows NT 10.0; Win64; x64',
  linux: 'X11; Linux x86_64',
};

export interface UserAgentOptions {
  /** Chromium user agent of the underlying engine. */
  baseUserAgent: string;
  /** Platform token to present. Defaults to the real platform (linux). */
  platform?: UserAgentPlatform;
  /** Value of the `browserUserAgent` config key, if set. */
  suffix?: string;
  /** Full replacement from `browserUserAgentWinDesktopModeCustom`, if set. */
  custom?: string;
}

/**
 * Strip Electron/app tokens that would otherwise leak into the user agent and
 * confuse servers that pattern-match on browser identity.
 */
export function cleanBaseUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\s*Electron\/[\d.]+/gi, '')
    .replace(/\s*seb-linux\/[\d.]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Replace the platform token inside a Chromium user agent string. */
export function withPlatform(userAgent: string, platform: UserAgentPlatform): string {
  const token = PLATFORM_TOKENS[platform];
  return userAgent.replace(/\(([^)]*)\)/, `(${token})`);
}

export function buildUserAgent(options: UserAgentOptions): string {
  const sebToken = `SEB/${SEB_VERSION}`;

  if (options.custom && options.custom.trim().length > 0) {
    return `${options.custom.trim()} ${sebToken}`;
  }

  let base = cleanBaseUserAgent(options.baseUserAgent);
  if (options.platform !== undefined) {
    base = withPlatform(base, options.platform);
  }

  const suffix = options.suffix?.trim();
  return suffix && suffix.length > 0 ? `${base} ${sebToken} ${suffix}` : `${base} ${sebToken}`;
}

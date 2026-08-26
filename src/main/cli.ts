/** Command line parsing for the Linux client. */

import type { UserAgentPlatform } from '../core/browser/userAgent';

export interface CliOptions {
  /** A .seb file path, a seb://…/sebs://… link, or a plain http(s) URL. */
  source?: string;
  /** Password for an encrypted .seb file. */
  password?: string;
  /** Parse configuration, report the Config Key and exit without opening a window. */
  verify: boolean;
  /** Open the window, load the start URL, report the result and exit. */
  selfTest: boolean;
  /** Run in a normal window instead of kiosk mode (for development). */
  noKiosk: boolean;
  /**
   * Keep kiosk mode but let the user switch to other windows: no always-on-top,
   * and Alt+Tab is not intercepted. For desktops where a stuck always-on-top
   * window cannot be recovered from otherwise.
   */
  allowSwitching: boolean;
  /** Platform token presented in the User-Agent header. */
  platform?: UserAgentPlatform;
  /** Verbose logging. */
  verbose: boolean;
  /** Register this build as the handler for seb:// links and .seb files, then exit. */
  install: boolean;
  /** Remove that registration, then exit. */
  uninstall: boolean;
  /** Ask Chromium to use native Wayland instead of XWayland. */
  wayland: boolean;
  /** Print usage and exit. */
  help: boolean;
}

const USAGE = `Safe Exam Browser for Linux (unofficial)

Usage:
  seb-linux [options] [<config.seb> | <seb://link> | <https://url>]

Options:
  --password=<password>   Password for an encrypted .seb configuration file
  --verify                Load the configuration, print the Config Key, then exit
  --self-test             Open the window, load the start URL, report the result, exit
  --platform=<p>          User-Agent platform token: windows (default) or linux
  --no-kiosk              Open a normal window instead of kiosk mode (development)
  --allow-switching       Keep kiosk mode but allow switching to other windows
                          (no always-on-top, Alt+Tab passes through)
  --install               Register for seb:// links and .seb files (current user), then exit
  --uninstall             Remove that registration, then exit
  --wayland               Use native Wayland instead of XWayland (see README)
  --verbose               Verbose logging
  -h, --help              Show this help
`;

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    verify: false,
    selfTest: false,
    noKiosk: false,
    allowSwitching: process.env.SEB_LINUX_ALLOW_SWITCHING === '1',
    install: false,
    uninstall: false,
    wayland: process.env.SEB_LINUX_WAYLAND === '1',
    verbose: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--verify') {
      options.verify = true;
    } else if (arg === '--self-test') {
      options.selfTest = true;
    } else if (arg === '--no-kiosk') {
      options.noKiosk = true;
    } else if (arg === '--allow-switching') {
      options.allowSwitching = true;
    } else if (arg === '--install') {
      options.install = true;
    } else if (arg === '--uninstall') {
      options.uninstall = true;
    } else if (arg === '--wayland') {
      options.wayland = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--platform=windows' || arg === '--platform=linux') {
      options.platform = arg.slice('--platform='.length) as UserAgentPlatform;
    } else if (arg.startsWith('--password=')) {
      options.password = arg.slice('--password='.length);
    } else if (arg.startsWith('-')) {
      // Ignore unknown/Electron/Chromium switches.
      continue;
    } else if (options.source === undefined) {
      options.source = arg;
    }
  }

  return options;
}

export function usage(): string {
  return USAGE;
}

/**
 * Electron passes the executable path (and, when running unpackaged, the app
 * path) as leading argv entries. Strip them so only user arguments remain.
 */
export function userArgs(argv: string[], isPackaged: boolean): string[] {
  return argv.slice(isPackaged ? 1 : 2);
}

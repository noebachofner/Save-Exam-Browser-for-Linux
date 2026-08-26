import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { logger } from './logger';

/**
 * Per-user desktop integration.
 *
 * An AppImage is a single file that nothing knows about: no menu entry, and no
 * handler for `seb://` links or `.seb` files. Rather than asking people to hand
 * -write a desktop entry, the application registers itself for the current user.
 * Everything lands under $HOME, so no root is needed and nothing is touched
 * system-wide.
 */

const run = promisify(execFile);

const DESKTOP_FILE_NAME = 'seb-linux.desktop';
const MIME_TYPES = ['x-scheme-handler/seb', 'x-scheme-handler/sebs', 'application/x-seb'];

function applicationsDir(): string {
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(dataHome, 'applications');
}

/**
 * The command that starts this build.
 *
 * Inside an AppImage, `process.execPath` points at the unpacked binary in a
 * temporary mount that disappears when the app exits, so the desktop entry must
 * reference the AppImage file itself — which is what $APPIMAGE holds.
 */
export function launcherCommand(): string {
  return process.env.APPIMAGE || process.execPath;
}

function desktopEntry(exec: string): string {
  // %u passes the seb:// URL or file path the desktop hands us.
  return `[Desktop Entry]
Type=Application
Name=Safe Exam Browser for Linux
Comment=Unofficial SEB-compatible exam browser
Exec="${exec}" %u
Terminal=false
Categories=Education;
Keywords=exam;seb;safeexambrowser;
MimeType=${MIME_TYPES.join(';')};
StartupWMClass=Safe Exam Browser for Linux
`;
}

async function tryRun(command: string, args: string[]): Promise<void> {
  try {
    await run(command, args);
  } catch (error) {
    // These helpers are missing on minimal systems; the desktop entry itself is
    // still written, which is the part that matters.
    logger.debug(`Optional step failed: ${command} ${args.join(' ')} (${String(error)})`);
  }
}

/** Register this build as the handler for seb:// links and .seb files. */
export async function installDesktopEntry(): Promise<string> {
  const dir = applicationsDir();
  const path = join(dir, DESKTOP_FILE_NAME);
  const exec = launcherCommand();

  mkdirSync(dir, { recursive: true });
  writeFileSync(path, desktopEntry(exec), { mode: 0o644 });
  logger.info(`Wrote desktop entry: ${path}`);
  logger.info(`Launcher: ${exec}`);

  await tryRun('update-desktop-database', [dir]);
  for (const mimeType of MIME_TYPES) {
    await tryRun('xdg-mime', ['default', DESKTOP_FILE_NAME, mimeType]);
  }

  return path;
}

/** Remove the per-user registration written by installDesktopEntry. */
export async function uninstallDesktopEntry(): Promise<string> {
  const dir = applicationsDir();
  const path = join(dir, DESKTOP_FILE_NAME);

  rmSync(path, { force: true });
  logger.info(`Removed desktop entry: ${path}`);
  await tryRun('update-desktop-database', [dir]);

  return path;
}

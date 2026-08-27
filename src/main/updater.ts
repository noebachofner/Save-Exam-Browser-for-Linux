import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { logger } from './logger';

/**
 * Automatic updates.
 *
 * The timing matters more than the mechanism here. Restarting an exam browser
 * mid-session would be far worse than running a version that is a few days old,
 * so this never installs while the client is in use: it checks once at start-up,
 * downloads in the background, and lets electron-updater apply the update when
 * the application quits. Nothing interrupts a running exam.
 *
 * Which installer is used follows how the client was packaged: the AppImage
 * replaces itself, while the .deb installs through pkexec/sudo and therefore
 * asks for an administrator password.
 *
 * The .pacman package is not covered. electron-builder writes no
 * latest-linux.yml entry for that target, and worse, a combined build leaves it
 * carrying the deb marker it inherited from the shared output directory — so an
 * Arch install would claim to be a deb and reach for dpkg. The marker alone is
 * therefore not trustworthy; we also check that the tool it names actually
 * exists. See INSTALL.md for updating an Arch install by hand.
 */

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'unavailable' | 'error';

export interface UpdaterHandle {
  status(): UpdateStatus;
  /** The version that has been downloaded and will be applied on quit. */
  pendingVersion(): string;
}

const NO_UPDATE_ENV = 'SEB_LINUX_NO_UPDATE';

/** How long to wait for the update check before giving up on it entirely. */
const CHECK_TIMEOUT_MS = 20_000;

/** True when the named command can actually be run on this system. */
export function hasCommand(command: string): boolean {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * How this build was installed, as far as the updater can tell.
 *
 * An AppImage exposes its own path in $APPIMAGE. Otherwise electron-builder's
 * `package-type` marker names the installer — but a combined build stamps every
 * Linux package with the same marker, so a .pacman install also claims "deb".
 * Requiring the named package manager to exist separates the two: a real Debian
 * install has dpkg, an Arch one does not.
 */
export function packageKind(): 'appimage' | 'deb' | 'unsupported' {
  if (process.env.APPIMAGE) {
    return 'appimage';
  }
  try {
    const marker = join(process.resourcesPath, 'package-type');
    if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === 'deb') {
      return hasCommand('dpkg') || hasCommand('apt-get') ? 'deb' : 'unsupported';
    }
  } catch {
    // Fall through: an unreadable marker is treated as unsupported.
  }
  return 'unsupported';
}

export function updatesDisabled(explicitlyDisabled: boolean): string | undefined {
  if (explicitlyDisabled || process.env[NO_UPDATE_ENV] === '1') {
    return 'disabled by the user';
  }
  if (!app.isPackaged) {
    // An unpackaged run has no update metadata to compare against.
    return 'running unpackaged';
  }
  if (packageKind() === 'unsupported') {
    return 'this package format cannot update itself; update it with your package manager';
  }
  return undefined;
}

/**
 * Start a single background update check.
 *
 * Never rejects: an unreachable update server must not keep anyone out of an
 * exam, so every failure is logged and swallowed.
 */
export function startUpdateCheck(
  onStatusChange: (status: UpdateStatus, version: string) => void,
): UpdaterHandle {
  let status: UpdateStatus = 'idle';
  let pendingVersion = '';

  const setStatus = (next: UpdateStatus, version = ''): void => {
    status = next;
    if (version) {
      pendingVersion = version;
    }
    onStatusChange(status, pendingVersion);
  };

  void (async () => {
    try {
      // Imported lazily so an unpackaged run never loads it at all.
      const { autoUpdater } = await import('electron-updater');

      autoUpdater.logger = {
        info: (message: unknown) => logger.info(`updater: ${String(message)}`),
        warn: (message: unknown) => logger.warn(`updater: ${String(message)}`),
        error: (message: unknown) => logger.error(`updater: ${String(message)}`),
        debug: (message: unknown) => logger.debug(`updater: ${String(message)}`),
      };

      autoUpdater.autoDownload = true;
      // The whole point: apply it on the way out, never mid-session.
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.allowPrerelease = false;

      autoUpdater.on('update-available', (info) => {
        logger.info(`Update available: ${info.version}. It will be installed when you quit.`);
        setStatus('downloading', info.version);
      });
      autoUpdater.on('update-not-available', () => {
        logger.info('No update available; already on the latest version.');
        setStatus('unavailable');
      });
      autoUpdater.on('update-downloaded', (info) => {
        logger.info(`Update ${info.version} downloaded; it will be installed on quit.`);
        setStatus('ready', info.version);
      });
      autoUpdater.on('error', (error) => {
        logger.warn(`Update check failed: ${error instanceof Error ? error.message : String(error)}`);
        setStatus('error');
      });

      setStatus('checking');

      // A hung request must not leave the indicator stuck on "checking".
      const timeout = new Promise<void>((resolve) => {
        setTimeout(() => {
          if (status === 'checking') {
            logger.warn('Update check timed out.');
            setStatus('error');
          }
          resolve();
        }, CHECK_TIMEOUT_MS);
      });

      await Promise.race([autoUpdater.checkForUpdates().then(() => undefined), timeout]);
    } catch (error) {
      logger.warn(`Updates unavailable: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('error');
    }
  })();

  return {
    status: () => status,
    pendingVersion: () => pendingVersion,
  };
}

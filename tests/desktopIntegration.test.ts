import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDesktopEntry, launcherCommand, uninstallDesktopEntry } from '../src/main/desktopIntegration';

describe('desktop integration', () => {
  let dataHome: string;
  const originalDataHome = process.env.XDG_DATA_HOME;
  const originalAppImage = process.env.APPIMAGE;

  beforeEach(() => {
    dataHome = mkdtempSync(join(tmpdir(), 'seb-xdg-'));
    process.env.XDG_DATA_HOME = dataHome;
  });

  afterEach(() => {
    rmSync(dataHome, { recursive: true, force: true });
    if (originalDataHome === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = originalDataHome;
    if (originalAppImage === undefined) delete process.env.APPIMAGE;
    else process.env.APPIMAGE = originalAppImage;
  });

  it('points the launcher at the AppImage file when running as one', () => {
    // Inside an AppImage, execPath is a temporary mount that vanishes on exit,
    // so a desktop entry referencing it would break after the first run.
    process.env.APPIMAGE = '/home/someone/Downloads/seb-linux.AppImage';
    expect(launcherCommand()).toBe('/home/someone/Downloads/seb-linux.AppImage');
  });

  it('falls back to the executable path outside an AppImage', () => {
    delete process.env.APPIMAGE;
    expect(launcherCommand()).toBe(process.execPath);
  });

  it('registers the seb:// and .seb handlers', async () => {
    process.env.APPIMAGE = '/opt/seb.AppImage';
    const path = await installDesktopEntry();
    const entry = readFileSync(path, 'utf8');

    expect(entry).toContain('MimeType=x-scheme-handler/seb;x-scheme-handler/sebs;application/x-seb');
    expect(entry).toContain('Exec="/opt/seb.AppImage" %u');
    expect(entry).toContain('Type=Application');
  });

  it('writes under XDG_DATA_HOME so no root is needed', async () => {
    const path = await installDesktopEntry();
    expect(path.startsWith(dataHome)).toBe(true);
  });

  it('removes the entry again', async () => {
    const path = await installDesktopEntry();
    expect(existsSync(path)).toBe(true);
    await uninstallDesktopEntry();
    expect(existsSync(path)).toBe(false);
  });
});

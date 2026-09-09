import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'src', 'main', 'updater.ts'), 'utf8');
const index = readFileSync(join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
const workflow = readFileSync(join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');

describe('automatic updates', () => {
  it('never installs while the client is running', () => {
    // A restart mid-exam would be far worse than running a slightly old build.
    expect(source).toContain('autoInstallOnAppQuit = true');
    expect(source).not.toContain('quitAndInstall');
  });

  it('does not block start-up on the update check', () => {
    // The call must not be awaited: an unreachable update server must never
    // stand between the user and their exam.
    expect(index).toContain('beginUpdateCheck();');
    expect(index).not.toMatch(/await\s+beginUpdateCheck/);
  });

  it('requires the package manager to exist, not just the marker', () => {
    // A combined build stamps the .pacman package with the deb marker too, so
    // trusting it alone would make an Arch install reach for dpkg.
    expect(source).toContain("hasCommand('dpkg')");
    expect(source).toContain("hasCommand('apt-get')");
  });

  it('publishes the metadata the updater reads', () => {
    // Without latest-linux.yml in the release there is nothing to check against.
    expect(workflow).toContain('release/latest-linux.yml');
    expect(workflow).toContain('auto-update would find nothing');
  });

  it('can be turned off', () => {
    expect(source).toContain('SEB_LINUX_NO_UPDATE');
  });
});

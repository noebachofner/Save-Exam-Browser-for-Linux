/**
 * Smoke test: launches the built Electron app in --verify mode against a
 * generated test configuration and asserts it reports a Config Key and exits 0.
 * Runs under xvfb-run when no display is available.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const electron = join(root, 'node_modules', '.bin', 'electron');

const config = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>startURL</key><string>https://example.edu/quiz</string>
  <key>sendBrowserExamKey</key><true/>
  <key>allowQuit</key><true/>
  <key>browserViewMode</key><integer>1</integer>
</dict>
</plist>
`;

const dir = mkdtempSync(join(tmpdir(), 'seb-smoke-'));
const file = join(dir, 'smoke.seb');
writeFileSync(file, config, 'utf8');

// A local page so the self test never depends on network access.
const page = join(dir, 'exam.html');
writeFileSync(page, '<!doctype html><title>Mock Exam</title><h1>Mock Exam</h1>', 'utf8');

const liveConfig = config.replace('https://example.edu/quiz', `file://${page}`);
const liveFile = join(dir, 'live.seb');
writeFileSync(liveFile, liveConfig, 'utf8');

const hasDisplay = Boolean(process.env.DISPLAY);
const entry = join(root, 'dist/main/index.js');

function run(label, appArgs) {
  const command = hasDisplay ? electron : 'xvfb-run';
  const args = hasDisplay ? [entry, ...appArgs] : ['-a', electron, entry, ...appArgs];

  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  // Chromium is noisy about D-Bus and GPU on headless CI; that is not a failure.
  const interesting = output
    .split('\n')
    .filter((line) => !/bus\.cc|gpu|dbus|Failed to connect to the bus|GLES|Vulkan/i.test(line))
    .join('\n')
    .trim();

  console.log(`\n--- ${label} ---`);
  console.log(interesting);

  if (result.status !== 0) {
    console.error(`\nSmoke test FAILED at "${label}": exit code ${result.status}`);
    process.exit(1);
  }
  return output;
}

// 1. Configuration is parsed and a Config Key is derived.
const verifyOutput = run('verify configuration', ['--verify', file]);
if (!/Config Key\s*:\s*[0-9a-f]{64}/.test(verifyOutput)) {
  console.error('\nSmoke test FAILED: no Config Key in output');
  process.exit(1);
}

// 2. The browser really launches, renders a page and applies the SEB user agent.
const selfTestOutput = run('launch and render', ['--self-test', '--no-kiosk', liveFile]);
if (!/Self test\s*:\s*OK/.test(selfTestOutput)) {
  console.error('\nSmoke test FAILED: the window did not start correctly');
  process.exit(1);
}
if (!/navigator\.userAgent=.*SEB\//.test(selfTestOutput)) {
  console.error('\nSmoke test FAILED: the SEB user agent did not reach the page');
  process.exit(1);
}

console.log('\nSmoke test PASSED');

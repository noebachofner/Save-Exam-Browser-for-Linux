import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string): string => readFileSync(join(__dirname, '..', 'src', 'main', file), 'utf8');

/**
 * Both regressions broke the same journey: click a link, sign in, land in the
 * exam. Each failed after a *successful* sign-in, which is the worst moment.
 */
describe('sign-in flow', () => {
  it('cancels the configuration download so no save dialog appears', () => {
    const code = source('configDownload.ts');
    expect(code).toContain("'will-download'");
    expect(code).toContain('event.preventDefault()');
  });

  it('removes the download handler when the flow ends', () => {
    // The handler lives on a shared session; leaving it attached would swallow
    // downloads for the rest of the process.
    const code = source('configDownload.ts');
    expect(code).toContain("session.off('will-download', onWillDownload)");
  });

  it('does not quit while start-up is between windows', () => {
    // The sign-in window closes before the exam window exists. Quitting on
    // window-all-closed then ended the session right after signing in.
    const code = source('index.ts');
    const handler = code.slice(code.indexOf("app.on('window-all-closed'"));
    expect(handler).toContain('startupFinished');
    expect(code).toMatch(/let startupFinished = false/);
  });

  it('marks start-up finished on both the success and failure paths', () => {
    const code = source('index.ts');
    const occurrences = code.match(/startupFinished = true/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});

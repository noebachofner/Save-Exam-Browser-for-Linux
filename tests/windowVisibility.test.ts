import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string): string => readFileSync(join(__dirname, '..', 'src', 'main', file), 'utf8');

/**
 * Regressions that all presented identically to the user: the client launches
 * and no window ever appears.
 */
describe('window visibility', () => {
  it('shows the exam window without waiting for ready-to-show', () => {
    const code = source('kioskWindow.ts');
    // The window must be shown eagerly; a hanging start URL previously meant
    // ready-to-show never fired and nothing was ever displayed.
    const showIndex = code.indexOf('window.show();');
    const readyIndex = code.indexOf("window.once('ready-to-show'");
    expect(showIndex).toBeGreaterThan(-1);
    expect(showIndex).toBeLessThan(readyIndex);
  });

  it('reports a failed page load inside the window', () => {
    expect(source('kioskWindow.ts')).toContain("'did-fail-load'");
  });

  it('does not tear down the session when the start URL fails to load', () => {
    const code = source('index.ts');
    // The exam page lives in a view above the taskbar, so the load goes through
    // its WebContents rather than the window's own.
    const loadCall = code.indexOf('await examContents.loadURL(settings.startUrl)');
    expect(loadCall).toBeGreaterThan(-1);
    // The call must sit inside a try block, otherwise a failed load races the
    // did-fail-load handler and stacks a second error window on top.
    expect(code.slice(0, loadCall)).toMatch(/try\s*\{[^}]*$/);
  });

  it('tells the user when another instance holds the single-instance lock', () => {
    const code = source('index.ts');
    expect(code).toContain('requestSingleInstanceLock');
    expect(code).toContain('showErrorBox');
  });
});

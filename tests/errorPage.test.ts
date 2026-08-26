import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The error window is the only feedback a user gets when a session fails to
 * start, so it must be able to show the real reason. It once silently showed a
 * generic "no configuration" message because its strict CSP blocked the inline
 * script that filled in the details.
 */
describe('error page', () => {
  const html = readFileSync(join(__dirname, '..', 'src', 'renderer', 'error.html'), 'utf8');

  it('provides the placeholder elements the main process fills in', () => {
    expect(html).toContain('id="reason"');
    expect(html).toContain('id="source"');
  });

  it('carries no inline script, which its CSP would block', () => {
    expect(html).not.toMatch(/<script[\s>]/i);
  });

  it('keeps the strict content security policy', () => {
    expect(html).toContain("default-src 'none'");
  });
});

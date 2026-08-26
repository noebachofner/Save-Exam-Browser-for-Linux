import { describe, expect, it } from 'vitest';
import { AuthenticationRequiredError, looksLikeHtml } from '../src/core/net/sebUrl';

/**
 * A configuration link that requires a session answers 200 OK with a login
 * page. Without this check the HTML reached the plist parser and surfaced as an
 * unrelated syntax error.
 */
describe('login page detection', () => {
  it('recognises HTML documents', () => {
    expect(looksLikeHtml(Buffer.from('<!DOCTYPE html><html><body>Login</body></html>'))).toBe(true);
    expect(looksLikeHtml(Buffer.from('\n  <html lang="de">'))).toBe(true);
    expect(looksLikeHtml(Buffer.from('<head><title>Sign in</title>'))).toBe(true);
  });

  it('does not mistake a plist for HTML', () => {
    const plist = '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict/></plist>';
    expect(looksLikeHtml(Buffer.from(plist))).toBe(false);
  });

  it('does not mistake a binary .seb block for HTML', () => {
    expect(looksLikeHtml(Buffer.from('pswd\x02\x01binary'))).toBe(false);
  });

  it('names the final URL so the user can see where they were sent', () => {
    const error = new AuthenticationRequiredError('https://moodle.example.edu/login/index.php');
    expect(error.message).toContain('https://moodle.example.edu/login/index.php');
    expect(error.message).toContain('signed in');
  });
});

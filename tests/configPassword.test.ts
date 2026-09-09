import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptWithPassword } from '../src/core/crypto/passwordEncryption';
import {
  keyForBlock,
  parseSebConfig,
  PasswordRequiredError,
  WrongPasswordError,
} from '../src/core/config/sebConfig';

const PLIST =
  '<?xml version="1.0"?><plist version="1.0"><dict><key>startURL</key><string>https://x/exam</string></dict></plist>';

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

const block = (prefix: string, key: string): Buffer =>
  Buffer.concat([Buffer.from(prefix, 'latin1'), encryptWithPassword(Buffer.from(PLIST), key)]);

describe('encrypted configurations', () => {
  it('opens a pswd file encrypted with the empty password, unprompted', () => {
    // Configurations handed out to start an exam normally use this, and the
    // reference client tries it before ever asking anyone for a password.
    expect(parseSebConfig(block('pswd', '')).settings.startURL).toBe('https://x/exam');
  });

  it('opens a pwcc file encrypted with the empty password, unprompted', () => {
    expect(parseSebConfig(block('pwcc', '')).settings.startURL).toBe('https://x/exam');
  });

  it('opens a pswd file with the password used verbatim', () => {
    expect(parseSebConfig(block('pswd', 'geheim'), 'geheim').settings.startURL).toBe('https://x/exam');
  });

  it('opens a pwcc file, whose key is the hash of the password', () => {
    expect(parseSebConfig(block('pwcc', sha256('geheim')), 'geheim').settings.startURL).toBe(
      'https://x/exam',
    );
  });

  it('keys pwcc on the hash and pswd on the password itself', () => {
    expect(keyForBlock('pwcc', { value: 'geheim', isHash: false })).toBe(sha256('geheim'));
    expect(keyForBlock('pwcc', { value: 'already-a-hash', isHash: true })).toBe('already-a-hash');
    expect(keyForBlock('pswd', { value: 'geheim', isHash: false })).toBe('geheim');
  });

  it('still reports a file that genuinely needs a password', () => {
    expect(() => parseSebConfig(block('pswd', 'geheim'))).toThrow(PasswordRequiredError);
  });

  it('distinguishes a wrong password from a missing one', () => {
    expect(() => parseSebConfig(block('pswd', 'geheim'), 'falsch')).toThrow(WrongPasswordError);
  });
});

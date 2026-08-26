import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseSebConfig, PasswordRequiredError, UnsupportedFormatError } from '../src/core/config/sebConfig';
import {
  encryptWithPassword,
  decryptWithPassword,
  PasswordDecryptionError,
} from '../src/core/crypto/passwordEncryption';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>startURL</key><string>https://example.edu/quiz</string>
  <key>sendBrowserExamKey</key><true/>
</dict>
</plist>`;

const prefixed = (prefix: string, body: Buffer) => Buffer.concat([Buffer.from(prefix, 'latin1'), body]);

describe('.seb container parsing', () => {
  it('parses a plain XML plist', () => {
    const config = parseSebConfig(Buffer.from(XML, 'utf8'));
    expect(config.settings['startURL']).toBe('https://example.edu/quiz');
    expect(config.configKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('parses a gzip-compressed XML plist', () => {
    const config = parseSebConfig(gzipSync(Buffer.from(XML, 'utf8')));
    expect(config.settings['startURL']).toBe('https://example.edu/quiz');
  });

  it('parses a plnd block', () => {
    const config = parseSebConfig(prefixed('plnd', gzipSync(Buffer.from(XML, 'utf8'))));
    expect(config.settings['startURL']).toBe('https://example.edu/quiz');
  });

  it('parses a plnd block wrapped in an outer gzip layer', () => {
    const inner = prefixed('plnd', gzipSync(Buffer.from(XML, 'utf8')));
    const config = parseSebConfig(gzipSync(inner));
    expect(config.settings['startURL']).toBe('https://example.edu/quiz');
  });

  it('parses a password-encrypted pswd block', () => {
    const payload = encryptWithPassword(gzipSync(Buffer.from(XML, 'utf8')), 'hunter2');
    const config = parseSebConfig(prefixed('pswd', payload), 'hunter2');
    expect(config.settings['startURL']).toBe('https://example.edu/quiz');
  });

  it('parses a pwcc block the same way', () => {
    const payload = encryptWithPassword(Buffer.from(XML, 'utf8'), 'secret');
    const config = parseSebConfig(prefixed('pwcc', payload), 'secret');
    expect(config.settings['startURL']).toBe('https://example.edu/quiz');
  });

  it('reports when a password is required', () => {
    const payload = encryptWithPassword(Buffer.from(XML, 'utf8'), 'hunter2');
    expect(() => parseSebConfig(prefixed('pswd', payload))).toThrow(PasswordRequiredError);
  });

  it('rejects a wrong password', () => {
    const payload = encryptWithPassword(Buffer.from(XML, 'utf8'), 'hunter2');
    expect(() => parseSebConfig(prefixed('pswd', payload), 'wrong')).toThrow(PasswordDecryptionError);
  });

  it('reports public-key encrypted files as unsupported', () => {
    expect(() => parseSebConfig(prefixed('pkhs', Buffer.alloc(64)))).toThrow(UnsupportedFormatError);
  });

  it('rejects unknown formats', () => {
    expect(() => parseSebConfig(Buffer.from('junkjunkjunk', 'utf8'))).toThrow(UnsupportedFormatError);
  });

  it('yields the same config key regardless of container encoding', () => {
    const plain = parseSebConfig(Buffer.from(XML, 'utf8')).configKey;
    const compressed = parseSebConfig(gzipSync(Buffer.from(XML, 'utf8'))).configKey;
    const encrypted = parseSebConfig(
      prefixed('pswd', encryptWithPassword(Buffer.from(XML, 'utf8'), 'pw')),
      'pw',
    ).configKey;
    expect(compressed).toBe(plain);
    expect(encrypted).toBe(plain);
  });
});

describe('password encryption round trip', () => {
  it('decrypts what it encrypts', () => {
    const data = Buffer.from('some configuration payload', 'utf8');
    expect(decryptWithPassword(encryptWithPassword(data, 'pw'), 'pw')).toEqual(data);
  });

  it('detects tampering via the HMAC', () => {
    const encrypted = encryptWithPassword(Buffer.from('payload', 'utf8'), 'pw');
    const index = encrypted.length - 40;
    encrypted[index] = (encrypted[index] ?? 0) ^ 0xff;
    expect(() => decryptWithPassword(encrypted, 'pw')).toThrow(PasswordDecryptionError);
  });

  it('rejects truncated input', () => {
    expect(() => decryptWithPassword(Buffer.alloc(8), 'pw')).toThrow(PasswordDecryptionError);
  });
});

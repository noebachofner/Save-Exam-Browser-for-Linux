import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { computeConfigKey, computeConfigKeyHash } from '../src/core/crypto/configKey';
import { computeBrowserExamKey, computeBrowserExamKeyHash } from '../src/core/crypto/browserExamKey';
import { serializeCanonical } from '../src/core/crypto/canonicalJson';

describe('config key', () => {
  const config = { startURL: 'https://example.edu/quiz', sendBrowserExamKey: true };

  it('is the sha256 of the canonical serialization', () => {
    const expected = createHash('sha256').update(serializeCanonical(config), 'utf8').digest('hex');
    expect(computeConfigKey(config)).toBe(expected);
  });

  it('is 64 lowercase hex characters', () => {
    expect(computeConfigKey(config)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable regardless of key insertion order', () => {
    const reordered = { sendBrowserExamKey: true, startURL: 'https://example.edu/quiz' };
    expect(computeConfigKey(reordered)).toBe(computeConfigKey(config));
  });

  it('changes when a setting changes', () => {
    expect(computeConfigKey({ ...config, startURL: 'https://other.edu' })).not.toBe(computeConfigKey(config));
  });

  it('ignores originatorVersion, so configs differing only in it match', () => {
    const a = computeConfigKey({ ...config, originatorVersion: 'SEB_Win_3.9.0' });
    const b = computeConfigKey({ ...config, originatorVersion: 'SEB_Mac_3.3' });
    expect(a).toBe(b);
    expect(a).toBe(computeConfigKey(config));
  });
});

describe('per-request hashes', () => {
  const key = 'a'.repeat(64);
  const url = 'https://example.edu/mod/quiz/attempt.php?id=7';

  it('config key hash is sha256(url + configKey)', () => {
    const expected = createHash('sha256')
      .update(url + key, 'utf8')
      .digest('hex');
    expect(computeConfigKeyHash(key, url)).toBe(expected);
  });

  it('strips the URL fragment before hashing', () => {
    expect(computeConfigKeyHash(key, `${url}#section`)).toBe(computeConfigKeyHash(key, url));
    expect(computeBrowserExamKeyHash(key, `${url}#section`)).toBe(computeBrowserExamKeyHash(key, url));
  });

  it('browser exam key hash is sha256(url + bek)', () => {
    const expected = createHash('sha256')
      .update(url + key, 'utf8')
      .digest('hex');
    expect(computeBrowserExamKeyHash(key, url)).toBe(expected);
  });

  it('different URLs produce different hashes', () => {
    expect(computeConfigKeyHash(key, url)).not.toBe(computeConfigKeyHash(key, `${url}&page=2`));
  });
});

describe('browser exam key derivation', () => {
  it('is deterministic for the same inputs', () => {
    const params = { configurationKey: 'abc', salt: new Uint8Array([1, 2, 3, 4]) };
    expect(computeBrowserExamKey(params)).toBe(computeBrowserExamKey(params));
    expect(computeBrowserExamKey(params)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('depends on the salt', () => {
    const a = computeBrowserExamKey({ configurationKey: 'abc', salt: new Uint8Array([1]) });
    const b = computeBrowserExamKey({ configurationKey: 'abc', salt: new Uint8Array([2]) });
    expect(a).not.toBe(b);
  });
});

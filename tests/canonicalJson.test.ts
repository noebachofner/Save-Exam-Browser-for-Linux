import { describe, expect, it } from 'vitest';
import { compareKeys, serializeCanonical, type SebValue } from '../src/core/crypto/canonicalJson';

describe('canonical JSON serialization', () => {
  it('emits objects without whitespace', () => {
    expect(serializeCanonical({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('orders keys case-insensitively first, matching InvariantCulture', () => {
    // An ordinal sort would place "URLFilterEnable" before "allowQuit" because
    // 'U' < 'a' in code-point order. The reference client does not.
    const result = serializeCanonical({ URLFilterEnable: true, allowQuit: false });
    expect(result).toBe('{"allowQuit":false,"URLFilterEnable":true}');
  });

  it('drops the originatorVersion key', () => {
    expect(serializeCanonical({ originatorVersion: 'SEB_Win_3.9', startURL: 'x' })).toBe('{"startURL":"x"}');
  });

  it('drops empty nested objects but keeps non-empty ones', () => {
    expect(serializeCanonical({ empty: {}, full: { a: 1 } })).toBe('{"full":{"a":1}}');
  });

  it('keeps empty arrays', () => {
    expect(serializeCanonical({ rules: [] })).toBe('{"rules":[]}');
  });

  it('emits booleans lowercase and nulls as empty strings', () => {
    expect(serializeCanonical({ a: true, b: false, c: null })).toBe('{"a":true,"b":false,"c":""}');
  });

  it('base64-encodes binary data', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(serializeCanonical({ salt: bytes })).toBe('{"salt":"3q2+7w=="}');
  });

  it('serializes nested arrays of objects in order', () => {
    const config: { [key: string]: SebValue } = { rules: [{ b: 1, a: 2 }, { c: 3 }] };
    expect(serializeCanonical(config)).toBe('{"rules":[{"a":2,"b":1},{"c":3}]}');
  });

  it('formats integers and reals with invariant notation', () => {
    expect(serializeCanonical({ i: 42, r: 1.5 })).toBe('{"i":42,"r":1.5}');
  });

  it('compareKeys is a total order', () => {
    expect(compareKeys('a', 'b')).toBeLessThan(0);
    expect(compareKeys('b', 'a')).toBeGreaterThan(0);
    expect(compareKeys('a', 'a')).toBe(0);
  });
});

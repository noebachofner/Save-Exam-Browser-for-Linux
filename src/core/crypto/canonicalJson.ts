/**
 * Canonical JSON serialization for the Safe Exam Browser Config Key.
 *
 * This is a faithful port of the reference serializer in the official Windows
 * client (SafeExamBrowser.Configuration/ConfigurationData/Json.cs). The exact
 * byte output matters: the Config Key is the SHA-256 hash of this serialization,
 * and an exam server (e.g. the Moodle SEB access rule) only accepts the request
 * when its independently computed Config Key matches ours.
 *
 * Important fidelity notes, matching the reference implementation:
 *  - Object keys are ordered with culture-aware (InvariantCulture-like) ordering.
 *  - The `originatorVersion` key is skipped.
 *  - Empty objects are skipped entirely.
 *  - Strings are emitted verbatim (the reference serializer does NOT escape them).
 *  - Booleans are lowercase, numbers use invariant formatting.
 *  - `null` is emitted as an empty string literal `""`.
 */

/** A value that can appear in a parsed .seb configuration tree. */
export type SebValue =
  string | number | boolean | null | Uint8Array | SebValue[] | { [key: string]: SebValue };

const ORIGINATOR_VERSION = 'originatorversion';

/**
 * Culture-aware comparison approximating .NET's StringComparer.InvariantCulture,
 * which is what the reference client uses to order configuration keys. For the
 * ASCII camelCase keys used throughout .seb files this orders case-insensitively
 * first, with case only breaking ties — unlike a raw ordinal comparison.
 */
const collator = new Intl.Collator('en', { sensitivity: 'variant', caseFirst: 'lower', numeric: false });

export function compareKeys(a: string, b: string): number {
  const result = collator.compare(a, b);
  if (result !== 0) {
    return result;
  }
  // Deterministic tiebreaker for keys the collator treats as equal.
  return a < b ? -1 : a > b ? 1 : 0;
}

function isPlainObject(value: SebValue): value is { [key: string]: SebValue } {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array)
  );
}

function serializeNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString(10);
  }
  // Invariant (dot) decimal formatting; JS default already uses '.'.
  return value.toString();
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function serializeValue(value: SebValue, out: string[]): void {
  if (value === null) {
    out.push('""');
    return;
  }
  if (value instanceof Uint8Array) {
    out.push('"', toBase64(value), '"');
    return;
  }
  if (Array.isArray(value)) {
    serializeArray(value, out);
    return;
  }
  if (isPlainObject(value)) {
    serializeObject(value, out);
    return;
  }
  switch (typeof value) {
    case 'boolean':
      out.push(value ? 'true' : 'false');
      return;
    case 'number':
      out.push(serializeNumber(value));
      return;
    case 'string':
      // Reference serializer writes strings verbatim, without escaping.
      out.push('"', value, '"');
      return;
    default:
      out.push('""');
  }
}

function serializeArray(list: SebValue[], out: string[]): void {
  out.push('[');
  list.forEach((item, index) => {
    serializeValue(item, out);
    if (index < list.length - 1) {
      out.push(',');
    }
  });
  out.push(']');
}

function serializeObject(obj: { [key: string]: SebValue }, out: string[]): void {
  const entries = Object.entries(obj)
    .filter(([key]) => key.toLowerCase() !== ORIGINATOR_VERSION)
    .filter(([, value]) => !(isPlainObject(value) && Object.keys(value).length === 0))
    .sort((a, b) => compareKeys(a[0], b[0]));

  out.push('{');
  entries.forEach(([key, value], index) => {
    out.push('"', key, '"', ':');
    serializeValue(value, out);
    if (index < entries.length - 1) {
      out.push(',');
    }
  });
  out.push('}');
}

/** Serialize a configuration dictionary into the canonical SEB Config Key form. */
export function serializeCanonical(config: { [key: string]: SebValue }): string {
  const out: string[] = [];
  serializeObject(config, out);
  return out.join('');
}

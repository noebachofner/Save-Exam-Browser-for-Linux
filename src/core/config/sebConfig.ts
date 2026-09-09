import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import type { SebValue } from '../crypto/canonicalJson';
import { computeConfigKey } from '../crypto/configKey';
import { decryptWithPassword } from '../crypto/passwordEncryption';
import { parsePlist } from './plist';

/**
 * Reader for .seb configuration containers.
 *
 * A .seb file is one of:
 *   - a plain XML plist, or
 *   - an (optionally gzip-compressed) block prefixed with a 4-byte format tag.
 *
 * Format tags (SafeExamBrowser.Configuration/DataFormats/BinaryBlock.cs):
 *   plnd  plain data
 *   pswd  password-encrypted
 *   pwcc  password-encrypted (configure-client)
 *   pkhs  public-key-encrypted
 *   phsk  public-key + symmetric
 */

const PREFIX_LENGTH = 4;
const BLOCK_PLAIN = 'plnd';
const BLOCK_PASSWORD = 'pswd';
const BLOCK_PASSWORD_CONFIGURE_CLIENT = 'pwcc';
const BLOCK_PUBLIC_KEY = 'pkhs';
const BLOCK_PUBLIC_KEY_SYMMETRIC = 'phsk';

export class SebConfigError extends Error {}
export class PasswordRequiredError extends SebConfigError {
  constructor() {
    super('This .seb file is password-protected; a password is required.');
  }
}
export class WrongPasswordError extends SebConfigError {
  constructor() {
    super('The password did not decrypt this .seb file.');
  }
}

/**
 * One password to try against an encrypted block.
 *
 * `isHash` marks a value that is already a hash rather than something the user
 * typed, which matters for `pwcc` blocks: those are keyed on the hash of the
 * password, so a typed password has to be hashed first while a stored hash must
 * be used as it stands.
 */
export interface PasswordAttempt {
  value: string;
  isHash: boolean;
}

/** SHA-256, lowercase hex — the form the reference client hashes passwords into. */
function hashPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}

/**
 * The key actually handed to the cipher, which depends on the block type.
 *
 * Reference: SafeExamBrowser.Configuration/DataFormats/BinaryParser.cs
 * (DetermineEncryptionParametersFor).
 */
export function keyForBlock(prefix: string, attempt: PasswordAttempt): string {
  if (prefix === BLOCK_PASSWORD_CONFIGURE_CLIENT) {
    return attempt.isHash ? attempt.value : hashPassword(attempt.value);
  }
  return attempt.value;
}
export class UnsupportedFormatError extends SebConfigError {}

export interface SebConfig {
  /** The parsed configuration dictionary. */
  settings: { [key: string]: SebValue };
  /** The deterministic Config Key (SHA-256 hex) for this configuration. */
  configKey: string;
}

function isGzip(data: Buffer): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

function maybeGunzip(data: Buffer): Buffer {
  return isGzip(data) ? gunzipSync(data) : data;
}

function looksLikeXml(data: Buffer): boolean {
  const prefix = data.subarray(0, PREFIX_LENGTH).toString('latin1');
  return prefix.toLowerCase() === '<?xm' || prefix.startsWith('<');
}

function parseSettings(xml: string): SebConfig {
  const settings = parsePlist(xml);
  return { settings, configKey: computeConfigKey(settings) };
}

function parsePlainBlock(body: Buffer): SebConfig {
  const decompressed = maybeGunzip(body);
  return parseSettings(decompressed.toString('utf8'));
}

/**
 * Parse the raw bytes of a .seb file. Provide `password` for password-protected
 * files. Public-key encrypted files are not supported on Linux (they require the
 * institution's private key / certificate store).
 */
export function parseSebConfig(raw: Buffer, password?: string): SebConfig {
  let data = maybeGunzip(raw);

  if (looksLikeXml(data)) {
    return parseSettings(data.toString('utf8'));
  }

  const prefix = data.subarray(0, PREFIX_LENGTH).toString('latin1');
  const body = data.subarray(PREFIX_LENGTH);

  switch (prefix) {
    case BLOCK_PLAIN:
      return parsePlainBlock(body);

    case BLOCK_PASSWORD:
    case BLOCK_PASSWORD_CONFIGURE_CLIENT: {
      // Match the order the reference client tries before it ever prompts
      // (ConfigurationBaseOperation.TryLoadSettings):
      //  1. the empty password, and
      //  2. the hash of the current settings password — which on a normally
      //     installed client is the hash of the empty string.
      // Classtime and similar platforms encrypt the exam-start config with that
      // second key, which is exactly why Windows never asks: it retries with it
      // automatically. Without this step a file that needs no user password
      // would still reach the prompt.
      const attempts: PasswordAttempt[] = [
        { value: '', isHash: true },
        { value: hashPassword(''), isHash: true },
      ];
      if (password !== undefined) {
        attempts.push({ value: password, isHash: false });
      }

      for (const attempt of attempts) {
        let decrypted: Buffer;
        try {
          decrypted = decryptWithPassword(Buffer.from(body), keyForBlock(prefix, attempt));
        } catch {
          continue;
        }
        // The decrypted payload is itself a (possibly compressed) plain block or XML.
        data = maybeGunzip(decrypted);
        if (looksLikeXml(data)) {
          return parseSettings(data.toString('utf8'));
        }
        if (data.subarray(0, PREFIX_LENGTH).toString('latin1') === BLOCK_PLAIN) {
          return parsePlainBlock(data.subarray(PREFIX_LENGTH));
        }
        return parseSettings(data.toString('utf8'));
      }

      throw password === undefined ? new PasswordRequiredError() : new WrongPasswordError();
    }

    case BLOCK_PUBLIC_KEY:
    case BLOCK_PUBLIC_KEY_SYMMETRIC:
      throw new UnsupportedFormatError(
        'Public-key encrypted .seb files are not supported on Linux (they need the institution certificate).',
      );

    default:
      // Last resort: try to interpret as XML directly.
      if (looksLikeXml(data)) {
        return parseSettings(data.toString('utf8'));
      }
      throw new UnsupportedFormatError(`Unrecognized .seb format prefix: "${prefix}".`);
  }
}

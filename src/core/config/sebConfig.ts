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
      if (password === undefined) {
        throw new PasswordRequiredError();
      }
      const decrypted = decryptWithPassword(Buffer.from(body), password);
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

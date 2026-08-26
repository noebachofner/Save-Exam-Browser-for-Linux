import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Password-based encryption for .seb files, ported from the reference client
 * (SafeExamBrowser.Configuration/Cryptography/PasswordEncryption.cs).
 *
 * Layout of the encrypted payload (after the 4-byte format prefix has already
 * been stripped by the parser):
 *   [version:1][options:1][encryptionSalt:8][authenticationSalt:8][iv:16]
 *   [ciphertext:N][hmac:32]
 *
 * - Keys are derived with PBKDF2-HMAC-SHA1, 10000 iterations, 32-byte output.
 * - Cipher is AES-256-CBC with PKCS7 padding.
 * - The HMAC-SHA256 covers everything preceding it.
 */

const VERSION = 0x02;
const OPTIONS = 0x01;
const HEADER_SIZE = 2;
const SALT_SIZE = 8;
const IV_SIZE = 16;
const KEY_SIZE = 32;
const ITERATIONS = 10000;
const HMAC_SIZE = 32;

function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(Buffer.from(password, 'utf8'), salt, ITERATIONS, KEY_SIZE, 'sha1');
}

export class PasswordDecryptionError extends Error {}

/** Decrypt a password-protected .seb payload. */
export function decryptWithPassword(data: Buffer, password: string): Buffer {
  if (data.length < HEADER_SIZE + 2 * SALT_SIZE + IV_SIZE + HMAC_SIZE) {
    throw new PasswordDecryptionError('Encrypted data is too short to be valid.');
  }

  const encryptionSalt = data.subarray(HEADER_SIZE, HEADER_SIZE + SALT_SIZE);
  const authenticationSalt = data.subarray(HEADER_SIZE + SALT_SIZE, HEADER_SIZE + 2 * SALT_SIZE);
  const iv = data.subarray(HEADER_SIZE + 2 * SALT_SIZE, HEADER_SIZE + 2 * SALT_SIZE + IV_SIZE);
  const ciphertext = data.subarray(HEADER_SIZE + 2 * SALT_SIZE + IV_SIZE, data.length - HMAC_SIZE);
  const originalHmac = data.subarray(data.length - HMAC_SIZE);

  const authenticationKey = deriveKey(password, Buffer.from(authenticationSalt));
  const encryptionKey = deriveKey(password, Buffer.from(encryptionSalt));

  const computedHmac = createHmac('sha256', authenticationKey)
    .update(data.subarray(0, data.length - HMAC_SIZE))
    .digest();

  if (computedHmac.length !== originalHmac.length || !timingSafeEqual(computedHmac, originalHmac)) {
    throw new PasswordDecryptionError('Authentication failed: wrong password or corrupted data.');
  }

  const decipher = createDecipheriv('aes-256-cbc', encryptionKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Encrypt data into the password-protected .seb payload format (without prefix). */
export function encryptWithPassword(data: Buffer, password: string): Buffer {
  const encryptionSalt = randomBytes(SALT_SIZE);
  const authenticationSalt = randomBytes(SALT_SIZE);
  const iv = randomBytes(IV_SIZE);

  const encryptionKey = deriveKey(password, encryptionSalt);
  const authenticationKey = deriveKey(password, authenticationSalt);

  const cipher = createCipheriv('aes-256-cbc', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);

  const withoutHmac = Buffer.concat([
    Buffer.from([VERSION, OPTIONS]),
    encryptionSalt,
    authenticationSalt,
    iv,
    ciphertext,
  ]);

  const hmac = createHmac('sha256', authenticationKey).update(withoutHmac).digest();
  return Buffer.concat([withoutHmac, hmac]);
}

import { createHash, createHmac } from 'node:crypto';

/**
 * Browser Exam Key (BEK) support.
 *
 * On Windows the BEK is derived from the signed executable's code-signature
 * hash. On Linux we cannot reproduce a Windows binary's signature, so the BEK
 * is treated as an explicitly configured value: either
 *   1. left empty — appropriate when the exam only checks the Config Key, or
 *   2. supplied by the user (e.g. a key the institution has whitelisted).
 *
 * We never fabricate a signature to impersonate a specific signed build. What we
 * do provide is the documented, deterministic hashing used to place the BEK into
 * the `X-SafeExamBrowser-RequestHash` header, so that whenever a valid BEK is
 * known the header is computed correctly.
 *
 * Reference: SafeExamBrowser.Configuration/Cryptography/KeyGenerator.cs.
 */

/** Convert bytes to lowercase hex (matches the reference ToString helper). */
function toHex(bytes: Buffer): string {
  return bytes.toString('hex');
}

/**
 * Simplified Browser Exam Key calculation, matching the reference client's
 * fallback path when no integrity module is available:
 *   HMAC-SHA256(salt, codeSignatureHash + programBuildVersion + configurationKey)
 */
export function computeBrowserExamKey(params: {
  configurationKey: string;
  salt: Uint8Array;
  codeSignatureHash?: string;
  programBuildVersion?: string;
}): string {
  const configurationKey = params.configurationKey ?? '';
  const salt = params.salt ?? new Uint8Array(0);
  const codeSignatureHash = params.codeSignatureHash ?? '';
  const programBuildVersion = params.programBuildVersion ?? '';

  const hmac = createHmac('sha256', Buffer.from(salt));
  hmac.update(codeSignatureHash + programBuildVersion + configurationKey, 'utf8');
  return toHex(hmac.digest());
}

/**
 * Compute the per-request Browser Exam Key hash for the
 * `X-SafeExamBrowser-RequestHash` header: SHA-256 of the request URL (without
 * fragment) concatenated with the Browser Exam Key.
 */
export function computeBrowserExamKeyHash(browserExamKey: string, url: string): string {
  const urlWithoutFragment = url.split('#')[0] ?? url;
  return createHash('sha256')
    .update(urlWithoutFragment + browserExamKey, 'utf8')
    .digest('hex');
}

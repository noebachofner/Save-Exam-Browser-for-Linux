/**
 * Handling of `seb://` and `sebs://` configuration links.
 *
 * Institutions typically hand out a link like `seb://example.edu/exam.seb`
 * instead of a file. The scheme simply tells the client "download this and load
 * it as configuration": `seb://` maps to HTTP, `sebs://` maps to HTTPS.
 */

export class SebUrlError extends Error {}

/** Convert a seb:// or sebs:// link into the URL to actually fetch. */
export function resolveSebUrl(link: string): string {
  const trimmed = link.trim();
  if (/^sebs:\/\//i.test(trimmed)) {
    return 'https://' + trimmed.slice('sebs://'.length);
  }
  if (/^seb:\/\//i.test(trimmed)) {
    const rest = trimmed.slice('seb://'.length);
    // Many institutions publish seb:// links that are in fact served over HTTPS.
    // Prefer HTTPS and let the caller fall back if needed.
    return 'https://' + rest;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  throw new SebUrlError(`Not a recognized configuration link: "${link}".`);
}

/** The plain-HTTP fallback for a seb:// link, used if HTTPS is unavailable. */
export function resolveSebUrlInsecureFallback(link: string): string | undefined {
  const trimmed = link.trim();
  if (/^seb:\/\//i.test(trimmed)) {
    return 'http://' + trimmed.slice('seb://'.length);
  }
  return undefined;
}

export function isSebLink(value: string): boolean {
  return /^sebs?:\/\//i.test(value.trim());
}

/** Download a .seb configuration file over HTTP(S). */
export async function downloadSebConfig(url: string, userAgent: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new SebUrlError(`Failed to download configuration from ${url}: HTTP ${response.status}.`);
  }
  return Buffer.from(await response.arrayBuffer());
}

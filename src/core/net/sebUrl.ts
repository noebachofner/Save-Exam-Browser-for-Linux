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

/**
 * True when the payload is an HTML document rather than a .seb configuration.
 *
 * This is the common failure with links that require a session: the server
 * answers 200 OK with a login page, and the config parser then fails on markup
 * with an error that says nothing about the real cause.
 */
export function looksLikeHtml(data: Buffer): boolean {
  const head = data.subarray(0, 512).toString('latin1').trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<head');
}

/** Raised when a configuration link resolves to a login page. */
export class AuthenticationRequiredError extends SebUrlError {
  constructor(public readonly finalUrl: string) {
    super(
      `The server returned a web page instead of a configuration file (${finalUrl}). ` +
        'The link most likely requires you to be signed in. Download the .seb file in your ' +
        'browser while signed in, then start the client with that file.',
    );
  }
}

/** Download a .seb configuration file over HTTP(S). */
export async function downloadSebConfig(url: string, userAgent: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new SebUrlError(
      `Failed to download configuration from ${url}: HTTP ${response.status} ${response.statusText}.`,
    );
  }

  const data = Buffer.from(await response.arrayBuffer());

  // A redirect to a login form still arrives as 200 OK, so inspect the payload.
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.toLowerCase().includes('text/html') || looksLikeHtml(data)) {
    throw new AuthenticationRequiredError(response.url || url);
  }

  return data;
}

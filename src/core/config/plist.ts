import type { SebValue } from '../crypto/canonicalJson';

/**
 * Minimal Apple property-list (XML plist) parser, sufficient for .seb files.
 *
 * .seb configuration files are XML plists (optionally gzip-compressed and/or
 * password-encrypted). We avoid a heavyweight XML dependency and implement a
 * small, well-tested recursive-descent parser over the subset of elements SEB
 * uses: dict, key, string, integer, real, true, false, data, date, array.
 *
 * Reference for value handling: SafeExamBrowser.Configuration/DataFormats/XmlParser.cs.
 */

export class PlistParseError extends Error {}

interface Token {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  /** Raw text collected before this tag (already entity-decoded). */
  text: string;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

/** Tokenize into a flat list of element boundaries with intervening text. */
function tokenize(xml: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let text = '';

  while (i < xml.length) {
    const ch = xml[i];
    if (ch === '<') {
      const end = xml.indexOf('>', i);
      if (end === -1) {
        throw new PlistParseError('Malformed XML: unterminated tag.');
      }
      const rawTag = xml.slice(i + 1, end);
      i = end + 1;

      // Skip declarations, comments, doctype, processing instructions.
      if (rawTag.startsWith('?') || rawTag.startsWith('!')) {
        text = '';
        continue;
      }

      const closing = rawTag.startsWith('/');
      const selfClosing = rawTag.endsWith('/');
      const name = rawTag.replace(/^\//, '').replace(/\/$/, '').trim().split(/\s+/)[0] ?? '';

      tokens.push({ name, closing, selfClosing, text: decodeEntities(text) });
      text = '';
    } else {
      text += ch;
      i++;
    }
  }
  return tokens;
}

class Cursor {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  peek(): Token | undefined {
    return this.tokens[this.index];
  }

  next(): Token {
    const token = this.tokens[this.index];
    if (!token) {
      throw new PlistParseError('Unexpected end of plist.');
    }
    this.index++;
    return token;
  }
}

function parseValue(cursor: Cursor): SebValue {
  const token = cursor.next();
  if (token.closing) {
    throw new PlistParseError(`Unexpected closing tag </${token.name}>.`);
  }

  switch (token.name) {
    case 'dict':
      return token.selfClosing ? {} : parseDict(cursor);
    case 'array':
      return token.selfClosing ? [] : parseArray(cursor);
    case 'true':
      return true;
    case 'false':
      return false;
    case 'string':
      return token.selfClosing ? '' : readText(cursor, 'string');
    case 'integer':
      return parseInt(readText(cursor, 'integer').trim(), 10);
    case 'real':
      return parseFloat(readText(cursor, 'real').trim());
    case 'date':
      return readText(cursor, 'date').trim();
    case 'data':
      return base64ToBytes(readText(cursor, 'data'));
    default:
      throw new PlistParseError(`Unsupported plist element <${token.name}>.`);
  }
}

/** Read text content up to and including the matching closing tag. */
function readText(cursor: Cursor, name: string): string {
  const token = cursor.next();
  if (!token.closing || token.name !== name) {
    throw new PlistParseError(
      `Expected closing </${name}>, found <${token.closing ? '/' : ''}${token.name}>.`,
    );
  }
  return token.text;
}

function parseDict(cursor: Cursor): { [key: string]: SebValue } {
  const dict: { [key: string]: SebValue } = {};
  for (;;) {
    const token = cursor.peek();
    if (!token) {
      throw new PlistParseError('Unterminated <dict>.');
    }
    if (token.closing && token.name === 'dict') {
      cursor.next();
      return dict;
    }
    const keyToken = cursor.next();
    if (keyToken.name !== 'key' || keyToken.closing) {
      throw new PlistParseError(`Expected <key> inside <dict>, found <${keyToken.name}>.`);
    }
    const key = readText(cursor, 'key');
    dict[key] = parseValue(cursor);
  }
}

function parseArray(cursor: Cursor): SebValue[] {
  const array: SebValue[] = [];
  for (;;) {
    const token = cursor.peek();
    if (!token) {
      throw new PlistParseError('Unterminated <array>.');
    }
    if (token.closing && token.name === 'array') {
      cursor.next();
      return array;
    }
    array.push(parseValue(cursor));
  }
}

function base64ToBytes(text: string): Uint8Array {
  const cleaned = text.replace(/\s+/g, '');
  return new Uint8Array(Buffer.from(cleaned, 'base64'));
}

/** Parse an XML plist string into a configuration dictionary. */
export function parsePlist(xml: string): { [key: string]: SebValue } {
  const tokens = tokenize(xml).filter((t) => !(t.name === '' && t.text.trim() === ''));
  const cursor = new Cursor(tokens);

  // Advance to the top-level <plist> element, then to its root value.
  let token = cursor.peek();
  while (token && token.name !== 'plist') {
    cursor.next();
    token = cursor.peek();
  }
  if (token && token.name === 'plist') {
    cursor.next();
  }

  const root = parseValue(cursor);
  if (typeof root !== 'object' || root === null || Array.isArray(root) || root instanceof Uint8Array) {
    throw new PlistParseError('Root plist element must be a <dict>.');
  }
  return root;
}

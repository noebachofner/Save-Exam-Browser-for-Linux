import { describe, expect, it } from 'vitest';
import { parsePlist, PlistParseError } from '../src/core/config/plist';

const wrap = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>`;

describe('plist parser', () => {
  it('parses strings, integers, reals and booleans', () => {
    const result = parsePlist(
      wrap(`
        <key>startURL</key><string>https://example.edu</string>
        <key>browserViewMode</key><integer>1</integer>
        <key>zoom</key><real>1.25</real>
        <key>allowQuit</key><true/>
        <key>allowDownloads</key><false/>
      `),
    );
    expect(result).toMatchObject({
      startURL: 'https://example.edu',
      browserViewMode: 1,
      zoom: 1.25,
      allowQuit: true,
      allowDownloads: false,
    });
  });

  it('parses nested dictionaries and arrays', () => {
    const result = parsePlist(
      wrap(`
        <key>URLFilterRules</key>
        <array>
          <dict>
            <key>action</key><integer>1</integer>
            <key>active</key><true/>
            <key>expression</key><string>example.edu/*</string>
            <key>regex</key><false/>
          </dict>
        </array>
      `),
    );
    expect(result['URLFilterRules']).toEqual([
      { action: 1, active: true, expression: 'example.edu/*', regex: false },
    ]);
  });

  it('decodes base64 data into bytes', () => {
    const result = parsePlist(wrap('<key>examKeySalt</key><data>3q2+7w==</data>'));
    expect(result['examKeySalt']).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('decodes XML entities in strings', () => {
    const result = parsePlist(wrap('<key>startURL</key><string>https://x.edu?a=1&amp;b=2</string>'));
    expect(result['startURL']).toBe('https://x.edu?a=1&b=2');
  });

  it('handles empty dicts and arrays', () => {
    const result = parsePlist(wrap('<key>a</key><dict/><key>b</key><array/>'));
    expect(result['a']).toEqual({});
    expect(result['b']).toEqual([]);
  });

  it('handles an empty string element', () => {
    const result = parsePlist(wrap('<key>quitURL</key><string/>'));
    expect(result['quitURL']).toBe('');
  });

  it('rejects a non-dict root', () => {
    const xml = '<?xml version="1.0"?><plist version="1.0"><array/></plist>';
    expect(() => parsePlist(xml)).toThrow(PlistParseError);
  });

  it('rejects malformed XML', () => {
    expect(() => parsePlist('<?xml version="1.0"?><plist><dict><key>a</key')).toThrow(PlistParseError);
  });
});

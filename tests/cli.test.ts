import { describe, expect, it } from 'vitest';
import { parseArgs, sourceFromArgv, userArgs } from '../src/main/cli';

describe('command line parsing', () => {
  it('takes the first non-flag argument as the configuration source', () => {
    expect(parseArgs(['sebs://school.edu/exam']).source).toBe('sebs://school.edu/exam');
    expect(parseArgs(['exam.seb']).source).toBe('exam.seb');
  });

  it('accepts a source alongside flags in any order', () => {
    const options = parseArgs(['--verbose', 'seb://school.edu/exam', '--no-kiosk']);
    expect(options.source).toBe('seb://school.edu/exam');
    expect(options.verbose).toBe(true);
    expect(options.noKiosk).toBe(true);
  });

  it('ignores unknown Electron/Chromium switches', () => {
    const options = parseArgs(['--enable-features=Foo', 'sebs://school.edu/exam']);
    expect(options.source).toBe('sebs://school.edu/exam');
  });
});

describe('sourceFromArgv', () => {
  it('extracts the link a packaged desktop launch passes after the executable', () => {
    const argv = ['/opt/seb-linux/seb-linux', 'sebs://school.edu/exam'];
    expect(sourceFromArgv(argv, true)).toBe('sebs://school.edu/exam');
  });

  it('strips the extra leading entry when running unpackaged', () => {
    const argv = ['/usr/bin/electron', '/app/main.js', 'seb://school.edu/exam'];
    expect(sourceFromArgv(argv, false)).toBe('seb://school.edu/exam');
  });

  it('returns undefined when a launch carries no source', () => {
    expect(sourceFromArgv(['/opt/seb-linux/seb-linux'], true)).toBeUndefined();
    expect(sourceFromArgv(['/opt/seb-linux/seb-linux', '--verbose'], true)).toBeUndefined();
  });

  it('matches how userArgs slices the two launch shapes', () => {
    expect(userArgs(['exe', 'sebs://x'], true)).toEqual(['sebs://x']);
    expect(userArgs(['electron', 'main.js', 'sebs://x'], false)).toEqual(['sebs://x']);
  });
});

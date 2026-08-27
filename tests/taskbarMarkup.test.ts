import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const markup = readFileSync(join(__dirname, '..', 'src', 'renderer', 'taskbar.html'), 'utf8');
const preload = readFileSync(join(__dirname, '..', 'src', 'preload', 'taskbar.ts'), 'utf8');

describe('taskbar markup', () => {
  it('carries the controls the preload wires up', () => {
    for (const id of ['bar', 'quit', 'reload', 'clock', 'language']) {
      expect(markup).toContain(`id="${id}"`);
    }
  });

  it('has no inline script, which its CSP would block', () => {
    // Behaviour lives in the preload, which runs in an isolated world and is
    // not subject to the page's content security policy.
    expect(markup).not.toMatch(/<script[\s>]/i);
    expect(markup).toContain("default-src 'none'");
  });

  it('drives every control through IPC rather than the page', () => {
    expect(preload).toContain("ipcRenderer.invoke('taskbar:quit')");
    expect(preload).toContain("ipcRenderer.invoke('taskbar:reload')");
    expect(preload).toContain("ipcRenderer.invoke('taskbar:state')");
  });
});

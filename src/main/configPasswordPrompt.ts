import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';

/**
 * Modal prompt for the password of an encrypted .seb configuration.
 *
 * Needed because a session started from a `seb://` link has no command line to
 * put `--password=` on: whatever the exam platform hands over, the client has to
 * be able to ask for the rest itself.
 *
 * The supplied `verify` callback decides whether an entry is correct, by trying
 * to decrypt with it — there is no stored hash to compare against here.
 */
export function askForConfigPassword(verify: (password: string) => boolean): Promise<string | undefined> {
  return new Promise((resolve) => {
    const prompt = new BrowserWindow({
      show: false,
      width: 460,
      height: 260,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      title: 'Safe Exam Browser',
      webPreferences: {
        preload: join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const channel = `config-password:${Date.now()}`;
    let settled = false;

    const finish = (result: string | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      ipcMain.removeHandler(channel);
      prompt.removeAllListeners('closed');
      if (!prompt.isDestroyed()) {
        prompt.destroy();
      }
      resolve(result);
    };

    ipcMain.handle(channel, (_event, password: unknown) => {
      if (typeof password !== 'string') {
        return false;
      }
      const correct = verify(password);
      if (correct) {
        // Let the renderer's await settle before the window goes away.
        setImmediate(() => finish(password));
      }
      return correct;
    });

    prompt.on('closed', () => finish(undefined));
    prompt.once('ready-to-show', () => prompt.show());
    void prompt.loadFile(join(__dirname, '..', 'renderer', 'configPassword.html'), { query: { channel } });
  });
}

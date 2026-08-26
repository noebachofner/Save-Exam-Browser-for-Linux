import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { verifyPassword } from '../core/crypto/passwordHash';

/**
 * Modal password prompt shown when the configuration protects quitting with a
 * quit password (`hashedQuitPassword`).
 */
export function askForQuitPassword(parent: BrowserWindow, expectedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const prompt = new BrowserWindow({
      parent,
      modal: true,
      show: false,
      width: 420,
      height: 220,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      title: 'Quit Safe Exam Browser',
      webPreferences: {
        preload: join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const channel = `quit-password:${Date.now()}`;

    const cleanup = (result: boolean) => {
      ipcMain.removeHandler(channel);
      if (!prompt.isDestroyed()) {
        prompt.destroy();
      }
      resolve(result);
    };

    ipcMain.handle(channel, (_event, password: string) => {
      if (typeof password !== 'string') {
        return false;
      }
      const correct = verifyPassword(password, expectedHash);
      if (correct) {
        setImmediate(() => cleanup(true));
      }
      return correct;
    });

    prompt.on('closed', () => {
      ipcMain.removeHandler(channel);
      resolve(false);
    });

    prompt.once('ready-to-show', () => prompt.show());
    prompt.loadFile(join(__dirname, '..', 'renderer', 'quit.html'), { query: { channel } });
  });
}

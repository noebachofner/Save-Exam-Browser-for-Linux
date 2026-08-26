import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload bridge. Deliberately tiny: the only capability exposed to renderer
 * content is submitting a quit password on a one-shot channel handed to the
 * prompt window via its query string.
 */
contextBridge.exposeInMainWorld('sebLinux', {
  submitQuitPassword: (channel: string, password: string): Promise<boolean> => {
    if (!/^quit-password:\d+$/.test(channel)) {
      return Promise.resolve(false);
    }
    return ipcRenderer.invoke(channel, password);
  },
});

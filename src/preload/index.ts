import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload bridge. Deliberately tiny: the only capabilities exposed to renderer
 * content are submitting a password on a one-shot channel handed to the prompt
 * window via its query string. The channel patterns are checked here so a page
 * cannot reach any other IPC channel.
 */
contextBridge.exposeInMainWorld('sebLinux', {
  submitQuitPassword: (channel: string, password: string): Promise<boolean> => {
    if (!/^quit-password:\d+$/.test(channel)) {
      return Promise.resolve(false);
    }
    return ipcRenderer.invoke(channel, password);
  },
  submitConfigPassword: (channel: string, password: string): Promise<boolean> => {
    if (!/^config-password:\d+$/.test(channel)) {
      return Promise.resolve(false);
    }
    return ipcRenderer.invoke(channel, password);
  },
});

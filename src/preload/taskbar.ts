import { ipcRenderer } from 'electron';

/**
 * Taskbar behaviour.
 *
 * The taskbar page keeps a `default-src 'none'` CSP, so it carries no script of
 * its own. A preload runs in an isolated world with DOM access and is not
 * subject to that policy, which lets the strip stay scriptless while still being
 * interactive.
 */

interface TaskbarState {
  show: boolean;
  showQuit: boolean;
  showReload: boolean;
  showTime: boolean;
  showInputLanguage: boolean;
  height: number;
  inputLanguage: string;
}

function show(id: string, visible: boolean): HTMLElement | null {
  const element = document.getElementById(id);
  if (element) {
    element.hidden = !visible;
  }
  return element;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function startClock(element: HTMLElement): void {
  const tick = (): void => {
    element.textContent = formatTime(new Date());
  };
  tick();
  // Align to the next minute, then tick once a minute: the display has no
  // seconds, so a per-second timer would only burn wakeups.
  const msToNextMinute = 60_000 - (Date.now() % 60_000);
  setTimeout(() => {
    tick();
    setInterval(tick, 60_000);
  }, msToNextMinute);
}

async function apply(): Promise<void> {
  const state = (await ipcRenderer.invoke('taskbar:state')) as TaskbarState;

  const bar = document.getElementById('bar');
  if (bar) {
    // No reserved space is set aside for a hidden strip, so leaving it in the
    // document would only let it flash before the exam view paints over it.
    bar.hidden = !state.show;
    bar.style.height = `${state.height}px`;
  }
  if (!state.show) {
    return;
  }

  const quit = show('quit', state.showQuit);
  quit?.addEventListener('click', () => {
    void ipcRenderer.invoke('taskbar:quit');
  });

  const reload = show('reload', state.showReload);
  reload?.addEventListener('click', () => {
    void ipcRenderer.invoke('taskbar:reload');
  });

  const language = show('language', state.showInputLanguage && state.inputLanguage.length > 0);
  if (language) {
    language.textContent = state.inputLanguage.toUpperCase();
  }

  const clock = show('clock', state.showTime);
  if (clock) {
    startClock(clock);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  void apply();
});

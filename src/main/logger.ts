/** Minimal leveled logger writing to stdout/stderr. */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export class Logger {
  constructor(private threshold: LogLevel = 'info') {}

  setLevel(level: LogLevel): void {
    this.threshold = level;
  }

  private write(level: LogLevel, message: string, error?: unknown): void {
    if (ORDER[level] < ORDER[this.threshold]) {
      return;
    }
    const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${message}`;
    if (level === 'error') {
      console.error(line);
      if (error !== undefined) {
        console.error(error);
      }
    } else {
      console.log(line);
    }
  }

  debug(message: string): void {
    this.write('debug', message);
  }
  info(message: string): void {
    this.write('info', message);
  }
  warn(message: string): void {
    this.write('warn', message);
  }
  error(message: string, error?: unknown): void {
    this.write('error', message, error);
  }
}

export const logger = new Logger();

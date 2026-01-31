/**
 * Debug logging for @wavlake/paywall-client
 * 
 * Enable via config:
 * ```ts
 * const client = new PaywallClient({
 *   apiUrl: 'https://api.wavlake.com',
 *   debug: true,  // or custom logger
 * });
 * ```
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
}

// Global log buffer for debug panel access
const LOG_BUFFER_SIZE = 100;
const logBuffer: LogEntry[] = [];

/**
 * Get recent log entries (for debug panels)
 */
export function getLogBuffer(): LogEntry[] {
  return [...logBuffer];
}

/**
 * Clear the log buffer
 */
export function clearLogBuffer(): void {
  logBuffer.length = 0;
}

/**
 * Subscribe to log events
 */
type LogSubscriber = (entry: LogEntry) => void;
const subscribers: Set<LogSubscriber> = new Set();

export function subscribeToLogs(callback: LogSubscriber): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function addToBuffer(entry: LogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
  subscribers.forEach(cb => {
    try { cb(entry); } catch {}
  });
}

/**
 * Default console logger with formatting
 */
export const consoleLogger: Logger = {
  debug: (message, data) => {
    const entry: LogEntry = { timestamp: Date.now(), level: 'debug', category: 'paywall', message, data };
    addToBuffer(entry);
    console.debug(`[paywall:debug] ${message}`, data ?? '');
  },
  info: (message, data) => {
    const entry: LogEntry = { timestamp: Date.now(), level: 'info', category: 'paywall', message, data };
    addToBuffer(entry);
    console.info(`[paywall:info] ${message}`, data ?? '');
  },
  warn: (message, data) => {
    const entry: LogEntry = { timestamp: Date.now(), level: 'warn', category: 'paywall', message, data };
    addToBuffer(entry);
    console.warn(`[paywall:warn] ${message}`, data ?? '');
  },
  error: (message, data) => {
    const entry: LogEntry = { timestamp: Date.now(), level: 'error', category: 'paywall', message, data };
    addToBuffer(entry);
    console.error(`[paywall:error] ${message}`, data ?? '');
  },
};

/**
 * Silent/no-op logger
 */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Create a logger based on debug config
 */
export function createLogger(debug: boolean | Logger | undefined): Logger {
  if (!debug) return silentLogger;
  if (debug === true) return consoleLogger;
  return debug;
}

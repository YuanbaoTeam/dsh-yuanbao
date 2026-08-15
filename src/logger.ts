import type { Logger } from './types.js';

export type LogSink = Partial<Logger>;
export type ModuleLog = Logger;

const SECRET_KEYS = [/secret/i, /token/i, /signature/i, /authorization/i, /appkey/i, /app_key/i];

function sanitizeValue(key: string, value: unknown): unknown {
  if (SECRET_KEYS.some(pattern => pattern.test(key))) {
    return typeof value === 'string' && value.length > 0 ? '<redacted>' : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => sanitizeValue(String(index), item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = sanitizeValue(childKey, childValue);
    }
    return out;
  }
  return value;
}

function formatArgs(args: unknown[]): unknown[] {
  return args.map((arg, index) => sanitizeValue(String(index), arg));
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function emit(level: LogLevel, base: Partial<Logger> | undefined, message: string, args: unknown[]): void {
  const formatted = formatArgs(args);
  const consoleMethod = console[level] as (...values: unknown[]) => void;
  consoleMethod.call(console, message, ...formatted);

  const baseMethod = base?.[level];
  if (!baseMethod || base === console) return;
  baseMethod.call(base, message, ...formatted);
}

export function createLog(scope: string, base?: Partial<Logger>): Logger {
  const prefix = `[dsh-yuanbao:${scope}]`;
  return {
    info(message: string, ...args: unknown[]) {
      emit('info', base, `${prefix} ${message}`, args);
    },
    warn(message: string, ...args: unknown[]) {
      emit('warn', base, `${prefix} ${message}`, args);
    },
    error(message: string, ...args: unknown[]) {
      emit('error', base, `${prefix} ${message}`, args);
    },
    debug(message: string, ...args: unknown[]) {
      emit('debug', base, `${prefix} ${message}`, args);
    },
  };
}

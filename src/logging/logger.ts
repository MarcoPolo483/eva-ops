import type { LogLevel, LogEntry } from "../types.js";
import type { LogSink } from "./sinks.js";

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50
};

export type LoggerOptions = {
  level?: LogLevel;
  sinks?: LogSink[];
  redact?: (key: string, value: unknown) => unknown;
  context?: Record<string, unknown>;
};

export class Logger {
  private level: LogLevel;
  private sinks: LogSink[];
  private redact?: (key: string, value: unknown) => unknown;
  private baseContext: Record<string, unknown>;

  constructor(opts: LoggerOptions = {}) {
    this.level = opts.level ?? "info";
    this.sinks = opts.sinks ?? [];
    this.redact = opts.redact;
    this.baseContext = { ...(opts.context ?? {}) };
  }

  child(ctx: Record<string, unknown>): Logger {
    return new Logger({
      level: this.level,
      sinks: this.sinks,
      redact: this.redact,
      context: { ...this.baseContext, ...ctx }
    });
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private emit(level: LogLevel, msg: string, context?: Record<string, unknown>) {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.level]) return;
    const merged: Record<string, unknown> = { ...this.baseContext, ...(context ?? {}) };
    if (this.redact) {
      for (const k of Object.keys(merged)) {
        merged[k] = this.redact(k, merged[k]);
      }
    }
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      context: Object.keys(merged).length ? merged : undefined
    };
    for (const s of this.sinks) s.write(entry);
  }

  trace(msg: string, ctx?: Record<string, unknown>) { this.emit("trace", msg, ctx); }
  debug(msg: string, ctx?: Record<string, unknown>) { this.emit("debug", msg, ctx); }
  info(msg: string, ctx?: Record<string, unknown>) { this.emit("info", msg, ctx); }
  warn(msg: string, ctx?: Record<string, unknown>) { this.emit("warn", msg, ctx); }
  error(msg: string, ctx?: Record<string, unknown>) { this.emit("error", msg, ctx); }
}

export function createLogger(opts: LoggerOptions): Logger {
  return new Logger(opts);
}
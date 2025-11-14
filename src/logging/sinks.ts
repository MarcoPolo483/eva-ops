import type { LogEntry, LogLevel } from "../types.js";

export interface LogSink {
  write(entry: LogEntry): void;
  flush?(): void;
}

export class ConsoleSink implements LogSink {
  write(entry: LogEntry) {
    const line = JSON.stringify(entry);
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export class JSONLSink implements LogSink {
  constructor(private target: NodeJS.WritableStream = process.stdout) {}
  write(entry: LogEntry) {
    this.target.write(JSON.stringify(entry) + "\n");
  }
}

export class RingBufferSink implements LogSink {
  private buf: LogEntry[] = [];
  constructor(private capacity: number) {
    if (capacity <= 0) throw new Error("RingBufferSink.capacity must be > 0");
  }
  write(entry: LogEntry) {
    if (this.buf.length === this.capacity) this.buf.shift();
    this.buf.push(entry);
  }
  entries() {
    return this.buf.slice();
  }
  flush() { /* no-op */ }
}
import type { LogEntry } from "../../types.js";

export type Span = {
  spanId: string;
  parentId?: string;
  traceId: string;
  name: string;
  start: number;
  end?: number;
  attrs?: Record<string, any>;
  error?: string;
};

export interface TraceSink {
  record(span: Span): void;
  flush?(): void;
}

export class InMemoryTraceSink implements TraceSink {
  private spans: Span[] = [];
  record(span: Span) { this.spans.push({ ...span }); }
  all() { return this.spans.slice(); }
}

export function newTraceId(): string {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

export function newSpanId(): string {
  return Math.random().toString(16).slice(2);
}

export class Tracer {
  constructor(private sink: TraceSink) {}
  startSpan(name: string, traceId?: string, parentId?: string, attrs?: Record<string, any>): Span {
    const span: Span = {
      spanId: newSpanId(),
      traceId: traceId ?? newTraceId(),
      parentId,
      name,
      start: Date.now(),
      attrs
    };
    this.sink.record(span);
    return span;
  }
  endSpan(span: Span, error?: string) {
    span.end = Date.now();
    if (error) span.error = error;
    this.sink.record(span);
  }
}
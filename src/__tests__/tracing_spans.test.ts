import { describe, it, expect } from "vitest";
import { Tracer, InMemoryTraceSink } from "../rag/ingestion/tracing.js";

describe("Tracing spans", () => {
  it("records start and end", () => {
    const sink = new InMemoryTraceSink();
    const tracer = new Tracer(sink);
    const span = tracer.startSpan("test");
    tracer.endSpan(span);
    const all = sink.all();
    expect(all.length).toBeGreaterThanOrEqual(2); // start + end entries
    expect(all[0].name).toBe("test");
  });
});

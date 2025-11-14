import { describe, it, expect } from "vitest";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink, ConsoleSink } from "../logging/sinks.js";

describe("Logger", () => {
  it("writes entries above level", () => {
    const sink = new RingBufferSink(10);
    const logger = createLogger({ level: "info", sinks: [sink] });
    logger.debug("skip");
    logger.info("hello", { a: 1 });
    expect(sink.entries().length).toBe(1);
    expect(sink.entries()[0].msg).toBe("hello");
  });

  it("redacts sensitive fields", () => {
    const sink = new RingBufferSink(10);
    const logger = createLogger({
      level: "trace",
      sinks: [sink],
      redact: (k,v) => k === "secret" ? "[redacted]" : v
    });
    logger.info("test", { secret: "VALUE", keep: 1 });
    const e = sink.entries()[0];
    expect(e.context?.secret).toBe("[redacted]");
    expect(e.context?.keep).toBe(1);
  });
});
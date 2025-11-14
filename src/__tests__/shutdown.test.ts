import { describe, it, expect } from "vitest";
import { ShutdownManager } from "../shutdown/shutdown.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("ShutdownManager", () => {
  it("executes phases in order", async () => {
    const sink = new RingBufferSink(20);
    const logger = createLogger({ sinks: [sink], level: "info" });
    const sm = new ShutdownManager(logger);
    const order: string[] = [];
    sm.register({ name: "one", fn: () => { order.push("one"); } });
    sm.register({ name: "two", fn: async () => { order.push("two"); } });
    await sm.execute();
    expect(order).toEqual(["one", "two"]);
    expect(sink.entries().some(e => e.msg === "shutdown.phase.start")).toBe(true);
  });
});
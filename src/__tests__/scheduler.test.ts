import { describe, it, expect } from "vitest";
import { Scheduler } from "../scheduler/scheduler.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("Scheduler", () => {
  it("runs periodic tasks", async () => {
    const sink = new RingBufferSink(10);
    const logger = createLogger({ sinks: [sink], level: "error" });
    let count = 0;
    const sched = new Scheduler(logger).every("t", "50ms", () => { count++; });
    await new Promise(r => setTimeout(r, 160));
    sched.stop();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
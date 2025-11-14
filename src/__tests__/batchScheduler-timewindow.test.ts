import { describe, it, expect } from "vitest";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("BatchScheduler time window gating", () => {
  it("prevents execution outside window then allows inside", async () => {
    const sink = new RingBufferSink(20);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const now = Date.now();
    const sched = new BatchScheduler(logger, { maxConcurrent: 1 });

    sched.submit({
      id: "TW",
      priority: 8,
      timeWindow: { start: now + 150, end: now + 1000 }
    });

    await new Promise(r => setTimeout(r, 100));
    let snap = sched.snapshot();
    expect(snap.blocked.some(j => j.def.id === "TW")).toBe(true);

    await new Promise(r => setTimeout(r, 200));
    snap = sched.snapshot();
    // After window start it should have run (succeeded or running)
    expect(
      snap.succeeded.some(j => j.def.id === "TW") ||
      snap.running.some(j => j.def.id === "TW")
    ).toBe(true);
    sched.stop();
  });
});
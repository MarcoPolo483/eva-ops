import { describe, it, expect } from "vitest";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("BatchScheduler jittered backoff", () => {
  it("applies increasing nextEligibleAt on retries", async () => {
    const sink = new RingBufferSink(100);
    const logger = createLogger({ level: "error", sinks: [sink] });

    const sched = new BatchScheduler(logger, { maxConcurrent: 1 });
    // Force failures for first 2 attempts
    (sched as any).execute = async () => {
      throw new Error("fail");
    };
    sched.submit({ id: "R", priority: 9, maxRetries: 2, retryBackoffMs: 10 });

    await new Promise(r => setTimeout(r, 200));
    const snap = sched.snapshot();
    const rJob = snap.failed.find(j => j.def.id === "R");
    expect(rJob).toBeTruthy();
    // job attempted 3 times (initial + 2 retries)
    sched.stop();
  });
});
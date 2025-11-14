import { describe, it, expect } from "vitest";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { LockManager } from "../locks/lockManager.js";

describe("BatchScheduler resource locks", () => {
  it("defers job when resource tag locked by running job", async () => {
    const sink = new RingBufferSink(100);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const locks = new LockManager();
    const sched = new BatchScheduler(logger, { maxConcurrent: 2 }, locks);

    // Acquire a lock to simulate external process holding resource
    locks.acquire("shared", 500);

    sched.submit({ id: "J1", priority: 9, resourceTags: ["shared"] });
    sched.submit({ id: "J2", priority: 8, resourceTags: ["shared"] });

    await new Promise(r => setTimeout(r, 300));
    const snap = sched.snapshot();
    const succeeded = snap.succeeded.map(j => j.def.id);
    // Only first job should have succeeded after lock expiry
    expect(succeeded.includes("J1")).toBe(true);
    sched.stop();
  });
});

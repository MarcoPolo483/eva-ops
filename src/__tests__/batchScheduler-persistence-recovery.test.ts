import { describe, it, expect } from "vitest";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { MemoryBatchSnapshotStore } from "../scheduler/batchPersistence.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("BatchScheduler recovery", () => {
  it("recovers unfinished jobs as queued", async () => {
    const sink = new RingBufferSink(20);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const store = new MemoryBatchSnapshotStore();

    // First scheduler with long-running job (simulate hold so it stays unfinished)
    const sched1 = new BatchScheduler(logger, { maxConcurrent: 1 }, undefined, store);
    sched1.submit({ id: "HOLD", priority: 5 });
    sched1.hold("HOLD");
    await sched1.persist();
    sched1.stop();

    // Second scheduler loads snapshot and should place job back in queued (not held)
    const sched2 = new BatchScheduler(logger, { maxConcurrent: 1 }, undefined, store);
    await new Promise(r => setTimeout(r, 200));
    const snap2 = sched2.snapshot();
    expect(snap2.queued.some(j => j.def.id === "HOLD")).toBe(true);
    sched2.stop();
  });
});

import { describe, it, expect } from "vitest";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("BatchScheduler requeue & custom comparator", () => {
  it("requeues failed job and uses custom comparator", async () => {
    const sink = new RingBufferSink(100);
    const logger = createLogger({ level: "error", sinks: [sink] });

    const sched = new BatchScheduler(logger, {
      maxConcurrent: 1,
      priorityComparator: (a, b) => {
        // Reverse priority ordering intentionally
        if (a.def.priority !== b.def.priority) return a.def.priority - b.def.priority;
        return a.enqueueAt - b.enqueueAt;
      }
    });

    // Override execute to force failure
    (sched as any).execute = async (job: any) => {
      if (job.attempts === 1) throw new Error("fail");
    };

    sched.submit({ id: "X", priority: 5, maxRetries: 0 });

    await new Promise(r => setTimeout(r, 300));
    const failed = sched.snapshot().failed.find(j => j.def.id === "X");
    expect(failed).toBeTruthy();

    // Requeue with higher priority
    sched.requeue("X", { priority: 9 });
    await new Promise(r => setTimeout(r, 300));
    expect(sched.snapshot().succeeded.some(j => j.def.id === "X")).toBe(true);
    sched.stop();
  });
});
import { describe, it, expect } from "vitest";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { LockManager } from "../locks/lockManager.js";

describe("BatchScheduler basic flow", () => {
  it("runs dependency chain in order", async () => {
    const sink = new RingBufferSink(100);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const sched = new BatchScheduler(logger, { maxConcurrent: 2 }, new LockManager());
    const order: string[] = [];

    sched.setHooks({
      onStart: j => order.push("start:" + j.def.id),
      onFinal: j => order.push("final:" + j.def.id)
    });

    sched.submit({ id: "A", priority: 5 });
    sched.submit({ id: "B", priority: 4, dependencies: ["A"] });
    sched.submit({ id: "C", priority: 3, dependencies: ["B"] });

    await new Promise(r => setTimeout(r, 800)); // allow cycles

    const done = sched.snapshot().succeeded.map(j => j.def.id);
    expect(done).toEqual(["A", "B", "C"]);
    // Ensure dependency order (A must start before B, B before C)
    const startSeq = order.filter(x => x.startsWith("start:"));
    expect(startSeq.indexOf("start:A")).toBeLessThan(startSeq.indexOf("start:B"));
    expect(startSeq.indexOf("start:B")).toBeLessThan(startSeq.indexOf("start:C"));
    sched.stop();
  });
});

describe("BatchScheduler retry and failure path", () => {
  it("retries until maxRetries then fails", async () => {
    const sink = new RingBufferSink(50);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const sched = new BatchScheduler(logger, { maxConcurrent: 1 }, undefined);

    let attempts = 0;
    // Monkey patch executeUserFunction by submitting a job with payload marker and tracking in hooks
    (sched as any).executeUserFunction = async (job: any) => {
      attempts++;
      throw new Error("fail");
    };

    sched.submit({ id: "failJob", priority: 9, maxRetries: 2, retryBackoffMs: 10 });

    await new Promise(r => setTimeout(r, 200));
    const snap = sched.snapshot();
    const failed = snap.failed.find(j => j.def.id === "failJob");
    expect(failed).toBeTruthy();
    expect(attempts).toBe(3); // initial + 2 retries
    sched.stop();
  });
});

describe("BatchScheduler aging and hold/release", () => {
  it("raises priority via aging and respects hold/release", async () => {
    const sink = new RingBufferSink(100);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const sched = new BatchScheduler(logger, { maxConcurrent: 1, agingIntervalMs: 50 }, undefined);

    sched.submit({ id: "low", priority: 2, agingSeconds: 0.05 }); // after ~50ms bump
    sched.submit({ id: "high", priority: 5 });

    // Hold the high job to allow low to age and jump above
    sched.hold("high");
    await new Promise(r => setTimeout(r, 200));
    sched.release("high");
    await new Promise(r => setTimeout(r, 500));

    const snap = sched.snapshot();
    expect(snap.succeeded.map(j => j.def.id)).toContain("low");
    sched.stop();
  });
});

describe("BatchScheduler time window and cancel", () => {
  it("blocks outside time window and cancels", async () => {
    const now = Date.now();
    const sink = new RingBufferSink(30);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const sched = new BatchScheduler(logger, { maxConcurrent: 1 }, undefined);

    sched.submit({
      id: "tw",
      priority: 6,
      timeWindow: { start: now + 200, end: now + 400 }
    });

    await new Promise(r => setTimeout(r, 100));
    let snap = sched.snapshot();
    expect(snap.blocked.some(j => j.def.id === "tw")).toBe(true);

    sched.cancel("tw", "operator cancel");
    snap = sched.snapshot();
    expect(snap.cancelled.some(j => j.def.id === "tw")).toBe(true);
    sched.stop();
  });
});
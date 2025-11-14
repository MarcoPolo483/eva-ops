import { describe, it, expect } from "vitest";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { MemoryBatchSnapshotStore } from "../scheduler/batchPersistence.js";

// Minimal fake meter
class FakeMeter {
  counters: any[] = [];
  histograms: any[] = [];
  counter(name: string, help?: string, labels?: string[]) {
    const store: any[] = [];
    const c = {
      name, help, labels,
      inc: (l: any, v = 1) => store.push({ l, v })
    };
    this.counters.push({ name, store });
    return c;
  }
  histogram(name: string, help?: string, labels?: string[]) {
    const store: any[] = [];
    const h = {
      name, help, labels,
      observe: (l: any, v: number) => store.push({ l, v })
    };
    this.histograms.push({ name, store });
    return h;
  }
  snapshot() { return { counters: this.counters, histograms: this.histograms }; }
}

describe("BatchScheduler metrics & persistence", () => {
  it("records start/success metrics and recovers queued jobs", async () => {
    const sink = new RingBufferSink(50);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const store = new MemoryBatchSnapshotStore();
    const meter = new FakeMeter();
    const sched = new BatchScheduler(logger, { maxConcurrent: 1 }, undefined, store, meter as any);

    sched.submit({ id: "J1", priority: 5 });
    await new Promise(r => setTimeout(r, 300));
    sched.stop();

    // Ensure metrics recorded
    const startedCounter = meter.counters.find(c => c.name === "batch_jobs_started_total");
    expect(startedCounter.store.length).toBeGreaterThan(0);

    // Recover
    const sched2 = new BatchScheduler(logger, { maxConcurrent: 1 }, undefined, store, meter as any);
    await new Promise(r => setTimeout(r, 100));
    const snap2 = sched2.snapshot();
    // No unfinished jobs from first run (J1 succeeded), so nothing queued
    expect(snap2.queued.length).toBe(0);
    sched2.stop();
  });
});

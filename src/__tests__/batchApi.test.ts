import { describe, it, expect } from "vitest";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { listJobs, jobAction } from "../ops/batchApi.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("Batch API handlers", () => {
  it("lists jobs and performs actions", async () => {
    const sink = new RingBufferSink(100);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const sched = new BatchScheduler(logger, { maxConcurrent: 1 });

    sched.submit({ id: "A", priority: 5 });
    sched.submit({ id: "B", priority: 4 });

    const initial = listJobs(sched);
    expect(initial.counts.queued).toBeGreaterThan(0);

    jobAction(sched, "B", "hold");
    let snap = listJobs(sched);
    expect(snap.held.some(j => j.id === "B")).toBe(true);

    jobAction(sched, "B", "release");
    snap = listJobs(sched);
    expect(snap.held.some(j => j.id === "B")).toBe(false);

    jobAction(sched, "A", "cancel");
    snap = listJobs(sched);
    expect(snap.failed.some(j => j.id === "A")).toBe(false); // cancelled is not failed
    expect(snap.counts.cancelled).toBeGreaterThan(0);

    sched.stop();
  });
});
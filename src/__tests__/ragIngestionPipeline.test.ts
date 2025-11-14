import { describe, it, expect } from "vitest";
import { submitRagIngestion } from "../pipeline/ragIngestionPipeline.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("RAG ingestion pipeline", () => {
  it("submits phase jobs", () => {
    const sink = new RingBufferSink(50);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const sched = new BatchScheduler(logger, { maxConcurrent: 2 });

    submitRagIngestion(sched, { docIds: ["d1", "d2"] }, 6);
    const snap = sched.snapshot();
    expect(snap.queued.length).toBeGreaterThan(0);
    sched.stop();
  });
});
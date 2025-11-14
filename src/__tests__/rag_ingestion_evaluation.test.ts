import { describe, it, expect } from "vitest";
import { DefaultSourceResolver } from "../rag/ingestion/loadSources.js";
import { SimpleLineChunker } from "../rag/ingestion/chunkPhase.js";
import { FakeEmbedder } from "../rag/ingestion/tests/__mocks__/fakeEmbedder.js";
import { InMemoryVectorIndex } from "../rag/ingestion/indexPhase.js";
import { InMemoryManifestStore } from "../rag/ingestion/manifestStore.js";
import { InMemoryIndexSnapshotStore } from "../rag/ingestion/indexSnapshotStore.js";
import { MockEvaluationRunner } from "../rag/ingestion/evaluatePhase.js";
import { NoopSafetyGate } from "../rag/ingestion/safetyGate.js";
import { RagIngestionOrchestrator } from "../rag/ingestion/orchestrator.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("RAG ingestion evaluation", () => {
  it("produces evaluation metrics", async () => {
    const sink = new RingBufferSink(50);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const scheduler = new BatchScheduler(logger, { maxConcurrent: 5 });

    const orchestrator = new RagIngestionOrchestrator(
      scheduler,
      new DefaultSourceResolver(),
      new SimpleLineChunker(100),
      new FakeEmbedder(),
      new InMemoryVectorIndex(),
      undefined,
      new InMemoryManifestStore(),
      new MockEvaluationRunner(),
      new NoopSafetyGate(),
      new InMemoryIndexSnapshotStore(),
      {}
    );

    orchestrator.ingest({
      tenant: "evalTenant",
      inputs: [{ type: "text", content: "Alpha Beta", id: "D1" }],
      evaluationQueries: [{ qid: "Q1", query: "Alpha", relevantDocIds: ["D1"] }]
    });

    await new Promise((r) => setTimeout(r, 1500));
    const snap = scheduler.snapshot();
    const evaluateJob = snap.succeeded.find((j) => j.def.id.includes("-evaluate"));
    expect(evaluateJob).toBeDefined();
    scheduler.stop();
  });
});

import { describe, it, expect } from "vitest";
import { DefaultSourceResolver } from "../rag/ingestion/loadSources.js";
import { SimpleLineChunker } from "../rag/ingestion/chunkPhase.js";
import { FakeEmbedder } from "../rag/ingestion/tests/__mocks__/fakeEmbedder.js";
import { InMemoryVectorIndex } from "../rag/ingestion/indexPhase.js";
import { InMemoryManifestStore } from "../rag/ingestion/manifestStore.js";
import { InMemoryIndexSnapshotStore } from "../rag/ingestion/indexSnapshotStore.js";
import { NoopSafetyGate } from "../rag/ingestion/safetyGate.js";
import { RagIngestionOrchestrator } from "../rag/ingestion/orchestrator.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("RAG ingestion multi-tenant isolation", () => {
  it("processes tenants independently", async () => {
    const sink = new RingBufferSink(100);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const scheduler = new BatchScheduler(logger, { maxConcurrent: 6 });
    const orchestrator = new RagIngestionOrchestrator(
      scheduler,
      new DefaultSourceResolver(),
      new SimpleLineChunker(60),
      new FakeEmbedder(),
      new InMemoryVectorIndex(),
      undefined,
      new InMemoryManifestStore(),
      undefined,
      new NoopSafetyGate(),
      new InMemoryIndexSnapshotStore(),
      {}
    );

    orchestrator.ingest({
      tenant: "tenantA",
      inputs: [{ type: "text", content: "Alpha doc A", id: "A1" }]
    });
    orchestrator.ingest({
      tenant: "tenantB",
      inputs: [{ type: "text", content: "Beta doc B", id: "B1" }]
    });

    await new Promise((r) => setTimeout(r, 1500));
    const succeeded = scheduler.snapshot().succeeded.filter((j) => j.def.id.endsWith("-complete"));
    expect(succeeded.length).toBeGreaterThanOrEqual(2);
    scheduler.stop();
  });
});

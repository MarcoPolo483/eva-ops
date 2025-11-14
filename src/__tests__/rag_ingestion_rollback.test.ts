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

describe("RAG ingestion rollback", () => {
  it("triggers rollback on index phase failure", async () => {
    const sink = new RingBufferSink(50);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const scheduler = new BatchScheduler(logger, { maxConcurrent: 3 });
    const vectorIndex = new InMemoryVectorIndex();
    // Patch upsert to fail
    (vectorIndex as any).upsert = async () => {
      throw new Error("vector index failure");
    };

    const orchestrator = new RagIngestionOrchestrator(
      scheduler,
      new DefaultSourceResolver(),
      new SimpleLineChunker(100),
      new FakeEmbedder(),
      vectorIndex,
      undefined,
      new InMemoryManifestStore(),
      undefined,
      new NoopSafetyGate(),
      new InMemoryIndexSnapshotStore(),
      {}
    );

    orchestrator.ingest({
      tenant: "tenantX",
      inputs: [{ type: "text", content: "Doc Content", id: "docX" }]
    });

    await new Promise((r) => setTimeout(r, 1500));
    const failed = scheduler.snapshot().failed.filter((j) => j.def.id.includes("-index"));
    const rollback = scheduler.snapshot().succeeded.find((j) => j.def.id.includes("-rollback"));
    // We added rollback phase in orchestrator on failure; confirm presence
    expect(failed.length).toBeGreaterThan(0);
    expect(rollback).toBeDefined();
    scheduler.stop();
  });
});

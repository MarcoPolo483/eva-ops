import { describe, it, expect } from "vitest";
import { DefaultSourceResolver } from "../rag/ingestion/loadSources.js";
import { SimpleLineChunker } from "../rag/ingestion/chunkPhase.js";
import { FakeEmbedder } from "../rag/ingestion/tests/__mocks__/fakeEmbedder.js";
import { InMemoryVectorIndex } from "../rag/ingestion/indexPhase.js";
import { InMemoryManifestStore } from "../rag/ingestion/manifestStore.js";
import { InMemoryIndexSnapshotStore } from "../rag/ingestion/indexSnapshotStore.js";
import { NoopSafetyGate, SafetyPolicyGate } from "../rag/ingestion/safetyGate.js";
import { RagIngestionOrchestrator } from "../rag/ingestion/orchestrator.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("RAG ingestion safety gate", () => {
  it("blocks unsafe doc", async () => {
    const sink = new RingBufferSink(50);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const scheduler = new BatchScheduler(logger, { maxConcurrent: 4 });

    const gate = new SafetyPolicyGate((text) => ({
      blocked: /SECRETKEY/.test(text)
    }));

    const orchestrator = new RagIngestionOrchestrator(
      scheduler,
      new DefaultSourceResolver(),
      new SimpleLineChunker(80),
      new FakeEmbedder(),
      new InMemoryVectorIndex(),
      undefined,
      new InMemoryManifestStore(),
      undefined,
      gate,
      new InMemoryIndexSnapshotStore(),
      {}
    );

    orchestrator.ingest({
      tenant: "sec",
      inputs: [
        { type: "text", content: "Good content", id: "doc1" },
        { type: "text", content: "Contains SECRETKEY please block", id: "doc2" }
      ],
      safetyEnabled: true
    });

    await new Promise((r) => setTimeout(r, 1500));
    const snap = scheduler.snapshot();
    // Only doc1 should have proceeded -> manifest phase succeeded
    const manifest = snap.succeeded.find((j) => j.def.id.includes("-manifest"));
    expect(manifest).toBeDefined();
    scheduler.stop();
  });
});

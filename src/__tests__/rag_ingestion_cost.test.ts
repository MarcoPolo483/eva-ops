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
import { MeterRegistry } from "../core/registry.js";
import { prometheusText } from "../exporters/prometheus.js";

describe("RAG ingestion cost accounting", () => {
  it("records embedding cost metric", async () => {
    const meter = new MeterRegistry();
    const sink = new RingBufferSink(10);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const scheduler = new BatchScheduler(logger, { maxConcurrent: 2 }, undefined, undefined, meter);

    const orchestrator = new RagIngestionOrchestrator(
      scheduler,
      new DefaultSourceResolver(),
      new SimpleLineChunker(80),
      new FakeEmbedder(),
      new InMemoryVectorIndex(),
      undefined,
      new InMemoryManifestStore(),
      undefined,
      new NoopSafetyGate(),
      new InMemoryIndexSnapshotStore(),
      { pricing: { promptUSDPer1K: 0.5, completionUSDPer1K: 0 }, metrics: meter }
    );

    orchestrator.ingest({
      tenant: "costTenant",
      inputs: [{ type: "text", content: "Embedding cost test line", id: "C1" }]
    });

    await new Promise((r) => setTimeout(r, 1600));
    const expo = prometheusText(meter.snapshot());
    expect(expo).toMatch(/rag_ingestion_embeddings_cost_usd_total/);
    scheduler.stop();
  });
});

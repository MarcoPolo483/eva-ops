import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { RagApiRouter } from "../rag/api/router.js";
import { IngestionContextRegistry } from "../rag/ingestion/contextRegistry.js";
import { RagIngestionOrchestratorExtended } from "../rag/ingestion/orchestrator-extended.js";
import { DefaultSourceResolver } from "../rag/ingestion/loadSources.js";
import { SimpleLineChunker } from "../rag/ingestion/chunkPhase.js";
import { MockEmbedder } from "../rag/ingestion/embedPhase.js";
import { InMemoryVectorIndex } from "../rag/ingestion/indexPhase.js";
import { InMemoryManifestStore } from "../rag/ingestion/manifestStore.js";
import { InMemoryIndexSnapshotStore } from "../rag/ingestion/indexSnapshotStore.js";
import { NoopSafetyGate } from "../rag/ingestion/safetyGate.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

let server: http.Server;
let base: string;

beforeAll(async () => {
  const sink = new RingBufferSink(50);
  const logger = createLogger({ level: "error", sinks: [sink] });
  const scheduler = new BatchScheduler(logger, { maxConcurrent: 5 });
  const registry = new IngestionContextRegistry();
  const orchestrator = new RagIngestionOrchestratorExtended(
    scheduler,
    new DefaultSourceResolver(),
    new SimpleLineChunker(80),
    new MockEmbedder(),
    new InMemoryVectorIndex(),
    undefined,
    new InMemoryManifestStore(),
    undefined,
    new NoopSafetyGate(),
    new InMemoryIndexSnapshotStore(),
    registry,
    {}
  );
  const router = new RagApiRouter(orchestrator, registry);

  server = http.createServer((req, res) => router.handle(req, res));
  await new Promise<void>(r => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()));
});

it("POST /rag/ingest and GET status", async () => {
  const ingest = await fetch(`${base}/rag/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenant: "tapi",
      inputs: [{ type: "text", content: "Doc line one\nDoc line two", id: "apiDoc" }]
    })
  }).then(r => r.json());
  expect(ingest.ingestionId).toBeTruthy();

  await new Promise(r => setTimeout(r, 1000));

  const status = await fetch(`${base}/rag/ingest/${ingest.ingestionId}/status`).then(r => r.json());
  expect(status.state === "running" || status.state === "complete").toBe(true);
});

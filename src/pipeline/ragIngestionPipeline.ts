/**
 * Multi-phase RAG ingestion pipeline leveraging BatchScheduler.
 * Each phase submits a job; downstream jobs depend on upstream success.
 * Placeholder for integration with eva-rag (chunkers, embeddings, index, manifest).
 */

import { BatchScheduler } from "../scheduler/batchScheduler.js";

export type IngestionContext = {
  docIds: string[];
  options?: Record<string, unknown>;
};

export function submitRagIngestion(
  scheduler: BatchScheduler,
  ctx: IngestionContext,
  basePriority: number = 5
) {
  scheduler.submit({
    id: `ingest-chunk-${Date.now()}`,
    description: "Chunk documents",
    priority: basePriority + 0 as any,
    class: "rag",
    maxRetries: 2,
    resourceTags: ["chunker"],
    payload: {
      run: async (job: any) => {
        void job; // integrate with chunker
        await sleep(20);
      }
    }
  });

  scheduler.submit({
    id: `ingest-embed-${Date.now()}`,
    description: "Embed chunks",
    priority: basePriority - 1 as any,
    class: "rag",
    maxRetries: 2,
    dependencies: [/* resolved after adding chunk job id dynamically */],
    resourceTags: ["embedding"],
    payload: {
      run: async () => {
        await sleep(30);
      }
    }
  });

  // Additional phases (index build, publish manifest) can be appended similarly.
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
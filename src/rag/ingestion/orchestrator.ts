/**
 * Minimal orchestrator (simple chain) useful for tests that import "./orchestrator.js"
 * If your test suite expects this file, keep it as a thin façade over the Extended orchestrator.
 */
import type { BatchScheduler } from "../../scheduler/batchScheduler.js";

import type { IngestionRequest, ISourceResolver, IChunker, IEmbedder, IVectorIndex, ISparseIndex, IManifestStore, IEvaluationRunner, ISafetyGate, IndexSnapshotStore } from "./types.js";
import { RagIngestionOrchestratorExtended, type ExtendedOptions } from "./orchestrator-extended.js";
import { IngestionContextRegistry } from "./contextRegistry.js";

export class RagIngestionOrchestrator extends RagIngestionOrchestratorExtended {
  constructor(
    scheduler: BatchScheduler,
    resolver: ISourceResolver,
    chunker: IChunker,
    embedder: IEmbedder,
    vectorIndex: IVectorIndex,
    sparseIndex: ISparseIndex | undefined,
    manifestStore: IManifestStore,
    evalRunner: IEvaluationRunner | undefined,
    safetyGate: ISafetyGate,
    snapshotStore: IndexSnapshotStore,
    opts: ExtendedOptions = {}
  ) {
    const registry = new IngestionContextRegistry();
    super(scheduler, resolver, chunker, embedder, vectorIndex, sparseIndex, manifestStore, evalRunner, safetyGate, snapshotStore, registry, opts);
  }
}

// Re-export types to avoid test import churn
export type { ExtendedOptions };
export { RagIngestionOrchestratorExtended };
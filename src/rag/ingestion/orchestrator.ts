import {
  IngestionRequest,
  IngestionContext,
  ISourceResolver,
  IChunker,
  IEmbedder,
  IVectorIndex,
  ISparseIndex,
  IManifestStore,
  IEvaluationRunner,
  ISafetyGate,
  IndexSnapshotStore,
  IngestionPhase
} from "./types.js";
import { diffManifest, buildManifest } from "./manifestStore.js";
import { rollbackIndex } from "./rollback.js";
import { computeEmbeddingCost } from "./costMeter.js";
import { BatchScheduler } from "../../scheduler/batchScheduler.js";
import type { MeterRegistry } from "../../core/registry.js";
import { stableHash } from "./utils/hash.js";

export type OrchestratorOptions = {
  pricing?: { promptUSDPer1K: number; completionUSDPer1K: number };
  metrics?: MeterRegistry;
  maxDocs?: number;
  denyResourceTags?: string[];
};

export class RagIngestionOrchestrator {
  constructor(
    private scheduler: BatchScheduler,
    private resolver: ISourceResolver,
    private chunker: IChunker,
    private embedder: IEmbedder,
    private vectorIndex: IVectorIndex,
    private sparseIndex: ISparseIndex | undefined,
    private manifestStore: IManifestStore,
    private evalRunner: IEvaluationRunner | undefined,
    private safetyGate: ISafetyGate,
    private snapshotStore: IndexSnapshotStore,
    private opts: OrchestratorOptions = {}
  ) {
    if (this.opts.metrics) this.initMetrics(this.opts.metrics);
  }

  private mPhaseDur?: any;
  private mDocs?: any;
  private mChunks?: any;
  private mCost?: any;
  private mEvalPrecision?: any;
  private mEvalRecall?: any;
  private mEvalMRR?: any;

  private initMetrics(meter: MeterRegistry) {
    this.mPhaseDur = meter.histogram("rag_ingestion_phase_duration_seconds", "Phase duration seconds", [
      "phase",
      "tenant"
    ]);
    this.mDocs = meter.counter("rag_ingestion_docs_total", "Documents processed", ["tenant", "status"]);
    this.mChunks = meter.counter("rag_ingestion_chunks_total", "Chunks processed", ["tenant", "status"]);
    this.mCost = meter.counter("rag_ingestion_embeddings_cost_usd_total", "Embedding cost USD", ["tenant"]);
    this.mEvalPrecision = meter.gauge("rag_ingestion_eval_precision_at_k", "Precision@K", ["tenant", "k"]);
    this.mEvalRecall = meter.gauge("rag_ingestion_eval_recall_at_k", "Recall@K", ["tenant", "k"]);
    this.mEvalMRR = meter.gauge("rag_ingestion_eval_mrr", "MRR", ["tenant"]);
  }

  ingest(request: IngestionRequest): string {
    const ingestionId = request.ingestionId ?? "ing-" + stableHash(Date.now().toString()).slice(0, 8);
    const ctx: IngestionContext = {
      request: { ...request, ingestionId },
      phaseResults: [],
      startTime: Date.now()
    };

    // Submit jobs
    this.scheduler.submit({
      id: ingestionId + "-load",
      priority: request.priority ?? 5,
      class: "rag",
      payload: {
        run: async () => await this.runPhase(ctx, "load", () => this.loadPhase(ctx))
      }
    });

    this.scheduler.submit({
      id: ingestionId + "-chunk",
      priority: (request.priority ?? 5) - 1 as any,
      class: "rag",
      dependencies: [ingestionId + "-load"],
      payload: {
        run: async () => await this.runPhase(ctx, "chunk", () => this.chunkPhase(ctx))
      }
    });

    this.scheduler.submit({
      id: ingestionId + "-embed",
      priority: (request.priority ?? 5) - 2 as any,
      class: "rag",
      dependencies: [ingestionId + "-chunk"],
      payload: {
        run: async () => await this.runPhase(ctx, "embed", () => this.embedPhase(ctx))
      }
    });

    this.scheduler.submit({
      id: ingestionId + "-index",
      priority: (request.priority ?? 5) - 3 as any,
      class: "rag",
      dependencies: [ingestionId + "-embed"],
      payload: {
        run: async () => await this.runPhase(ctx, "index", () => this.indexPhase(ctx))
      }
    });

    this.scheduler.submit({
      id: ingestionId + "-manifest",
      priority: (request.priority ?? 5) - 4 as any,
      class: "rag",
      dependencies: [ingestionId + "-index"],
      payload: {
        run: async () => await this.runPhase(ctx, "manifest", () => this.manifestPhase(ctx))
      }
    });

    if (request.evaluationQueries?.length && this.evalRunner) {
      this.scheduler.submit({
        id: ingestionId + "-evaluate",
        priority: (request.priority ?? 5) - 5 as any,
        class: "rag",
        dependencies: [ingestionId + "-manifest"],
        payload: {
          run: async () => await this.runPhase(ctx, "evaluate", () => this.evaluatePhase(ctx))
        }
      });
    }

    this.scheduler.submit({
      id: ingestionId + "-complete",
      priority: (request.priority ?? 5) - 6 as any,
      class: "rag",
      dependencies: request.evaluationQueries?.length ? [ingestionId + "-evaluate"] : [ingestionId + "-manifest"],
      payload: {
        run: async () => await this.runPhase(ctx, "complete", async () => ({ ok: true }))
      }
    });

    return ingestionId;
  }

  private async runPhase<T>(ctx: IngestionContext, phase: IngestionPhase, fn: () => Promise<T>): Promise<void> {
    const start = Date.now();
    try {
      const data = await fn();
      const pr = { phase, tenant: ctx.request.tenant, startTime: start, endTime: Date.now(), data };
      ctx.phaseResults.push(pr);
      if (this.mPhaseDur) this.mPhaseDur.observe({ phase, tenant: ctx.request.tenant }, (pr.endTime - pr.startTime) / 1000);
    } catch (e: any) {
      const pr = { phase, tenant: ctx.request.tenant, startTime: start, endTime: Date.now(), error: e?.message };
      ctx.phaseResults.push(pr);
      if (phase === "index") {
        ctx.rollbackNeeded = true;
        await rollbackIndex(ctx.request.tenant, this.vectorIndex, this.sparseIndex, this.snapshotStore);
        const rbStart = Date.now();
        ctx.phaseResults.push({
          phase: "rollback",
          tenant: ctx.request.tenant,
          startTime: rbStart,
          endTime: Date.now(),
          data: { reason: pr.error }
        });
      }
      if (this.mPhaseDur)
        this.mPhaseDur.observe({ phase, tenant: ctx.request.tenant }, (pr.endTime - pr.startTime) / 1000);
    }
  }

  private async loadPhase(ctx: IngestionContext) {
    const inputs = ctx.request.inputs;
    if (this.opts.maxDocs && inputs.length > this.opts.maxDocs)
      throw new Error("Too many documents in batch");
    const docs = await this.resolver.resolve(inputs, ctx.request.tenant);
    ctx.docs = docs;
    if (ctx.request.safetyEnabled) {
      const gate = await this.safetyGate.check(docs);
      ctx.docs = gate.allowed;
      if (gate.blocked.length && this.mDocs)
        this.mDocs.inc({ tenant: ctx.request.tenant, status: "blocked" }, gate.blocked.length);
    }
    if (this.mDocs) this.mDocs.inc({ tenant: ctx.request.tenant, status: "loaded" }, ctx.docs.length);
    return { docCount: ctx.docs.length };
  }

  private async chunkPhase(ctx: IngestionContext) {
    if (!ctx.docs) throw new Error("No docs loaded");
    const prevManifest = await this.manifestStore.getLatest(ctx.request.tenant);
    const { changed, unchanged } = ctx.request.forceFull
      ? { changed: ctx.docs, unchanged: [] }
      : diffManifest(prevManifest, ctx.docs);
    const chunks = await this.chunker.chunk(changed, ctx.request.tenant);
    ctx.skippedDocs = unchanged.map((d) => d.docId);
    ctx.chunks = chunks;
    if (this.mChunks) {
      this.mChunks.inc({ tenant: ctx.request.tenant, status: "chunked" }, chunks.length);
      if (unchanged.length) this.mChunks.inc({ tenant: ctx.request.tenant, status: "skipped" }, unchanged.length);
    }
    return { chunkCount: chunks.length, skippedDocs: ctx.skippedDocs };
  }

  private async embedPhase(ctx: IngestionContext) {
    if (!ctx.chunks) throw new Error("No chunks");
    const embedded = await this.embedder.embed(ctx.chunks, ctx.request.tenant);
    ctx.embedded = embedded;
    if (this.opts.pricing && this.mCost) {
      const cost = computeEmbeddingCost(embedded, this.opts.pricing);
      this.mCost.inc({ tenant: ctx.request.tenant }, cost.usd);
    }
    return { embeddedCount: embedded.length };
  }

  private async indexPhase(ctx: IngestionContext) {
    if (!ctx.embedded) throw new Error("No embeddings");
    // Remove unchanged doc chunks first (if any)
    if (ctx.skippedDocs?.length) await this.vectorIndex.removeByDocIds(ctx.skippedDocs);
    await this.vectorIndex.upsert(ctx.embedded);
    if (this.sparseIndex) await this.sparseIndex.upsert(ctx.embedded);
    const snap = await this.vectorIndex.snapshot();
    await this.snapshotStore.save(snap, ctx.request.tenant);
    return { vectorCount: snap.vectorCount };
  }

  private async manifestPhase(ctx: IngestionContext) {
    if (!ctx.docs || !ctx.chunks) throw new Error("Missing data for manifest");
    const previous = await this.manifestStore.getLatest(ctx.request.tenant);
    const version = (previous?.version ?? 0) + 1;
    const manifest = buildManifest(
      ctx.request.ingestionId!,
      ctx.request.tenant,
      ctx.docs,
      ctx.chunks,
      version
    );
    ctx.manifest = manifest;
    await this.manifestStore.save(manifest);
    return { version };
  }

  private async evaluatePhase(ctx: IngestionContext) {
    if (!this.evalRunner || !ctx.request.evaluationQueries?.length) return { skipped: true };
    const result = await this.evalRunner.run(ctx.request.evaluationQueries, ctx.request.tenant);
    ctx.evalResults = result;
    if (this.mEvalMRR) this.mEvalMRR.set({ tenant: ctx.request.tenant }, result.mrr);
    for (const [k, v] of Object.entries(result.precisionAtK))
      this.mEvalPrecision.set({ tenant: ctx.request.tenant, k }, v);
    for (const [k, v] of Object.entries(result.recallAtK))
      this.mEvalRecall.set({ tenant: ctx.request.tenant, k }, v);
    return result;
  }

  getPhaseResults(ingestionId: string): IngestionPhase[] {
    // Could track contexts by ingestionId in a map; simplified for brevity.
    void ingestionId;
    return [];
  }
}
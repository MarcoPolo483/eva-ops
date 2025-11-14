import {
  type IngestionRequest,
  type IngestionContext,
  type ISourceResolver,
  type IChunker,
  type IEmbedder,
  type IVectorIndex,
  type ISparseIndex,
  type IManifestStore,
  type IEvaluationRunner,
  type ISafetyGate,
  type IndexSnapshotStore,
  type IngestionPhase
} from "./types.js";
import { diffManifest, buildManifest } from "./manifestStore.js";
import { rollbackIndex } from "./rollback.js";
import { computeEmbeddingCost } from "./costMeter.js";
import { stableHash } from "./utils/hash.js";
import type { MeterRegistry } from "../../core/registry.js";
import { IngestionContextRegistry } from "./contextRegistry.js";

export type ExtendedOptions = {
  pricing?: { promptUSDPer1K: number; completionUSDPer1K: number };
  metrics?: MeterRegistry;
  agingThresholdMs?: number;
};

export class RagIngestionOrchestratorExtended {
  constructor(
    private scheduler: import("../../scheduler/batchScheduler.js").BatchScheduler,
    private resolver: ISourceResolver,
    private chunker: IChunker,
    private embedder: IEmbedder,
    private vectorIndex: IVectorIndex,
    private sparseIndex: ISparseIndex | undefined,
    private manifestStore: IManifestStore,
    private evalRunner: IEvaluationRunner | undefined,
    private safetyGate: ISafetyGate,
    private snapshotStore: IndexSnapshotStore,
    private registry: IngestionContextRegistry,
    private opts: ExtendedOptions = {}
  ) {
    if (this.opts.metrics) this.initMetrics(this.opts.metrics);
  }

  private mPhaseDur?: any;
  private mDocs?: any;
  private mChunks?: any;
  private mCost?: any;

  private initMetrics(meter: MeterRegistry) {
    this.mPhaseDur = meter.histogram("rag_ingestion_phase_duration_seconds", "Phase sec", ["phase", "tenant"]);
    this.mDocs = meter.counter("rag_ingestion_docs_total", "Docs", ["tenant", "status"]);
    this.mChunks = meter.counter("rag_ingestion_chunks_total", "Chunks", ["tenant", "status"]);
    this.mCost = meter.counter("rag_ingestion_embeddings_cost_usd_total", "USD", ["tenant"]);
  }

  ingest(request: IngestionRequest): string {
    const ingestionId = request.ingestionId ?? "ing-" + stableHash(Date.now().toString()).slice(0, 8);
    const ctx: IngestionContext = { request: { ...request, ingestionId }, phaseResults: [], startTime: Date.now() };
    this.registry.register(ctx);

    const base = request.priority ?? 5;
    this.scheduler.submit({ id: ingestionId + "-load", class: "rag", priority: base, payload: { run: async () => this.runPhase(ctx, "load", () => this.loadPhase(ctx)) } });
    this.scheduler.submit({ id: ingestionId + "-chunk", class: "rag", priority: base - 1 as any, dependencies: [ingestionId + "-load"], payload: { run: async () => this.runPhase(ctx, "chunk", () => this.chunkPhase(ctx)) } });
    this.scheduler.submit({ id: ingestionId + "-embed", class: "rag", priority: base - 2 as any, dependencies: [ingestionId + "-chunk"], payload: { run: async () => this.runPhase(ctx, "embed", () => this.embedPhase(ctx)) } });
    this.scheduler.submit({ id: ingestionId + "-index", class: "rag", priority: base - 3 as any, dependencies: [ingestionId + "-embed"], payload: { run: async () => this.runPhase(ctx, "index", () => this.indexPhase(ctx)) } });
    this.scheduler.submit({ id: ingestionId + "-manifest", class: "rag", priority: base - 4 as any, dependencies: [ingestionId + "-index"], payload: { run: async () => this.runPhase(ctx, "manifest", () => this.manifestPhase(ctx)) } });
    if (request.evaluationQueries?.length && this.evalRunner) {
      this.scheduler.submit({ id: ingestionId + "-evaluate", class: "rag", priority: base - 5 as any, dependencies: [ingestionId + "-manifest"], payload: { run: async () => this.runPhase(ctx, "evaluate", () => this.evaluatePhase(ctx)) } });
    }
    this.scheduler.submit({
      id: ingestionId + "-complete",
      class: "rag",
      priority: base - 6 as any,
      dependencies: request.evaluationQueries?.length ? [ingestionId + "-evaluate"] : [ingestionId + "-manifest"],
      payload: { run: async () => this.runPhase(ctx, "complete", async () => ({ ok: true })) }
    });

    return ingestionId;
  }

  private async runPhase<T>(ctx: IngestionContext, phase: IngestionPhase, fn: () => Promise<T>) {
    const start = Date.now();
    try {
      const data = await fn();
      const rec = { phase, tenant: ctx.request.tenant, startTime: start, endTime: Date.now(), data };
      ctx.phaseResults.push(rec);
      this.mPhaseDur?.observe({ phase, tenant: ctx.request.tenant }, (rec.endTime - rec.startTime) / 1000);
    } catch (e: any) {
      const rec = { phase, tenant: ctx.request.tenant, startTime: start, endTime: Date.now(), error: e?.message || String(e) };
      ctx.phaseResults.push(rec);
      this.mPhaseDur?.observe({ phase, tenant: ctx.request.tenant }, (rec.endTime - rec.startTime) / 1000);
      if (phase === "index") {
        await rollbackIndex(ctx.request.tenant, this.vectorIndex, this.sparseIndex, this.snapshotStore);
        ctx.phaseResults.push({ phase: "rollback", tenant: ctx.request.tenant, startTime: Date.now(), endTime: Date.now(), data: { reason: rec.error } });
      }
    }
  }

  private async loadPhase(ctx: IngestionContext) {
    const docs = await this.resolver.resolve(ctx.request.inputs, ctx.request.tenant);
    if (ctx.request.safetyEnabled) {
      const gate = await this.safetyGate.check(docs);
      ctx.docs = gate.allowed;
      if (gate.blocked.length) this.mDocs?.inc({ tenant: ctx.request.tenant, status: "blocked" }, gate.blocked.length);
    } else {
      ctx.docs = docs;
    }
    this.mDocs?.inc({ tenant: ctx.request.tenant, status: "loaded" }, ctx.docs.length);
    return { docCount: ctx.docs.length };
  }

  private async chunkPhase(ctx: IngestionContext) {
    if (!ctx.docs) throw new Error("No docs loaded");
    const prev = await this.manifestStore.getLatest(ctx.request.tenant);
    const { changed, unchanged } = ctx.request.forceFull ? { changed: ctx.docs, unchanged: [] } : diffManifest(prev, ctx.docs);
    ctx.chunks = await this.chunker.chunk(changed, ctx.request.tenant);
    ctx.skippedDocs = unchanged.map((d) => d.docId);
    this.mChunks?.inc({ tenant: ctx.request.tenant, status: "chunked" }, ctx.chunks.length);
    if (ctx.skippedDocs.length) this.mChunks?.inc({ tenant: ctx.request.tenant, status: "skipped" }, ctx.skippedDocs.length);
    return { chunkCount: ctx.chunks.length, skippedDocs: ctx.skippedDocs };
  }

  private async embedPhase(ctx: IngestionContext) {
    if (!ctx.chunks) throw new Error("No chunks");
    ctx.embedded = await this.embedder.embed(ctx.chunks, ctx.request.tenant);
    if (this.opts.pricing && this.mCost) {
      const cost = computeEmbeddingCost(ctx.embedded, this.opts.pricing);
      this.mCost.inc({ tenant: ctx.request.tenant }, cost.usd);
    }
    return { embeddedCount: ctx.embedded.length };
  }

  private async indexPhase(ctx: IngestionContext) {
    if (!ctx.embedded) throw new Error("No embeddings");
    if (ctx.skippedDocs?.length) await this.vectorIndex.removeByDocIds(ctx.skippedDocs);
    await this.vectorIndex.upsert(ctx.embedded);
    if (this.sparseIndex) await this.sparseIndex.upsert(ctx.embedded);
    const snap = await this.vectorIndex.snapshot();
    await this.snapshotStore.save(snap, ctx.request.tenant);
    return { vectorCount: snap.vectorCount };
  }

  private async manifestPhase(ctx: IngestionContext) {
    if (!ctx.docs || !ctx.chunks) throw new Error("Missing data");
    const prev = await this.manifestStore.getLatest(ctx.request.tenant);
    const version = (prev?.version ?? 0) + 1;
    const manifest = buildManifest(ctx.request.ingestionId!, ctx.request.tenant, ctx.docs, ctx.chunks, version);
    ctx.manifest = manifest;
    await this.manifestStore.save(manifest);
    return { version };
  }

  private async evaluatePhase(ctx: IngestionContext) {
    if (!this.evalRunner || !ctx.request.evaluationQueries?.length) return { skipped: true };
    const result = await this.evalRunner.run(ctx.request.evaluationQueries, ctx.request.tenant);
    ctx.evalResults = result;
    return result;
  }
}
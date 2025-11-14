/**
 * Extended orchestrator integrating policies, safety enhancement, tracing, incremental intelligence,
 * advanced evaluation, and multi-phase rollback logic. This file replaces or supplements the prior orchestrator.
 */
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
import { PolicyEngine, GovernancePolicies } from "./policies.js";
import { rankChangedDocs, adaptivePriority } from "./incrementalIntelligence.js";
import { shouldSkipIndex, recordRollbackMetric } from "./rollbackPlan.js";
import { Tracer, Span } from "./tracing.js";
import { IngestionContextRegistry } from "./contextRegistry.js";
import { runRetrievalEvaluation, IRetriever } from "./retrievalEvaluation.js";

export type ExtendedOptions = {
  pricing?: { promptUSDPer1K: number; completionUSDPer1K: number };
  metrics?: MeterRegistry;
  policies?: GovernancePolicies;
  tracer?: Tracer;
  retriever?: IRetriever;
  agingThresholdMs?: number;
};

export class RagIngestionOrchestratorExtended {
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
    private registry: IngestionContextRegistry,
    private opts: ExtendedOptions = {}
  ) {
    this.policyEngine = new PolicyEngine(opts.policies || {});
    if (this.opts.metrics) this.initMetrics(this.opts.metrics);
  }

  private policyEngine: PolicyEngine;
  private mPhaseDur?: any;
  private mDocs?: any;
  private mChunks?: any;
  private mCost?: any;
  private mRollback?: any;
  private mSkippedDocs?: any;
  private mEvalPrecision?: any;
  private mEvalRecall?: any;
  private mEvalMRR?: any;
  private mQueryLatency?: any;

  private initMetrics(meter: MeterRegistry) {
    this.mPhaseDur = meter.histogram("rag_ingestion_phase_duration_seconds", "Phase duration seconds", ["phase", "tenant"]);
    this.mDocs = meter.counter("rag_ingestion_docs_total", "Documents processed", ["tenant", "status"]);
    this.mChunks = meter.counter("rag_ingestion_chunks_total", "Chunks processed", ["tenant", "status"]);
    this.mCost = meter.counter("rag_ingestion_embeddings_cost_usd_total", "Embedding cost USD", ["tenant"]);
    this.mRollback = meter.counter("rag_ingestion_rollback_total", "Rollbacks", ["tenant"]);
    this.mSkippedDocs = meter.counter("rag_incremental_skipped_docs_total", "Skipped unchanged docs", ["tenant"]);
    this.mEvalPrecision = meter.gauge("rag_ingestion_eval_precision_at_k", "Precision@K", ["tenant", "k"]);
    this.mEvalRecall = meter.gauge("rag_ingestion_eval_recall_at_k", "Recall@K", ["tenant", "k"]);
    this.mEvalMRR = meter.gauge("rag_ingestion_eval_mrr", "MRR", ["tenant"]);
    this.mQueryLatency = meter.histogram("rag_eval_query_latency_seconds", "Eval query latency sec", ["tenant"]);
  }

  ingest(request: IngestionRequest): string {
    const ingestionId = request.ingestionId ?? "ing-" + stableHash(Date.now().toString()).slice(0, 8);
    const ctx: IngestionContext = {
      request: { ...request, ingestionId },
      phaseResults: [],
      startTime: Date.now()
    };
    this.registry.register(ctx);

    // Governance pre-submit checks
    const activeIngestions = this.scheduler.snapshot().running.filter(j => j.def.class === "rag").length;
    const docByteSum = request.inputs.reduce((acc, r) => {
      if (r.type === "text") return acc + Buffer.byteLength(r.content);
      return acc;
    }, 0);
    const preEval = this.policyEngine.evaluatePreSubmit(request.tenant, activeIngestions, request.inputs.length, docByteSum);
    if (!preEval.ok) {
      ctx.phaseResults.push({
        phase: "load",
        tenant: request.tenant,
        startTime: Date.now(),
        endTime: Date.now(),
        error: preEval.reason
      });
      return ingestionId; // Mark as failed early
    }

    const basePriority = request.priority ?? 5;
    const makeSpan = (phase: string): Span | undefined =>
      this.opts.tracer?.startSpan(`ingestion.${phase}`, ctx.request.ingestionId, undefined, { tenant: request.tenant });

    this.scheduler.submit({
      id: ingestionId + "-load",
      priority: basePriority,
      class: "rag",
      payload: {
        run: async () => await this.runPhase(ctx, "load", () => this.loadPhase(ctx), makeSpan("load"))
      }
    });

    this.scheduler.submit({
      id: ingestionId + "-chunk",
      priority: basePriority - 1 as any,
      class: "rag",
      dependencies: [ingestionId + "-load"],
      payload: {
        run: async () => await this.runPhase(ctx, "chunk", () => this.chunkPhase(ctx), makeSpan("chunk"))
      }
    });

    this.scheduler.submit({
      id: ingestionId + "-embed",
      priority: basePriority - 2 as any,
      class: "rag",
      dependencies: [ingestionId + "-chunk"],
      payload: {
        run: async () => await this.runPhase(ctx, "embed", () => this.embedPhase(ctx), makeSpan("embed"))
      }
    });

    this.scheduler.submit({
      id: ingestionId + "-index",
      priority: basePriority - 3 as any,
      class: "rag",
      dependencies: [ingestionId + "-embed"],
      payload: {
        run: async () => await this.runPhase(ctx, "index", () => this.indexPhase(ctx), makeSpan("index"))
      }
    });

    this.scheduler.submit({
      id: ingestionId + "-manifest",
      priority: basePriority - 4 as any,
      class: "rag",
      dependencies: [ingestionId + "-index"],
      payload: {
        run: async () => await this.runPhase(ctx, "manifest", () => this.manifestPhase(ctx), makeSpan("manifest"))
      }
    });

    if (request.evaluationQueries?.length && (this.evalRunner || this.opts.retriever)) {
      this.scheduler.submit({
        id: ingestionId + "-evaluate",
        priority: basePriority - 5 as any,
        class: "rag",
        dependencies: [ingestionId + "-manifest"],
        payload: {
          run: async () => await this.runPhase(ctx, "evaluate", () => this.evaluatePhase(ctx), makeSpan("evaluate"))
        }
      });
    }

    this.scheduler.submit({
      id: ingestionId + "-complete",
      priority: basePriority - 6 as any,
      class: "rag",
      dependencies: request.evaluationQueries?.length ? [ingestionId + "-evaluate"] : [ingestionId + "-manifest"],
      payload: {
        run: async () => await this.runPhase(ctx, "complete", async () => ({ ok: true }), makeSpan("complete"))
      }
    });

    return ingestionId;
  }

  private async runPhase<T>(ctx: IngestionContext, phase: IngestionPhase, fn: () => Promise<T>, span?: Span): Promise<void> {
    const start = Date.now();
    try {
      // Adaptive priority example (not altering scheduler mid-run, just recorded)
      const waited = Date.now() - ctx.startTime;
      const agingThreshold = this.opts.agingThresholdMs ?? 10_000;
      const originalPriority = ctx.request.priority ?? 5;
      const maybeRaised = adaptivePriority(originalPriority, waited, agingThreshold);
      const data = await fn();
      const pr = { phase, tenant: ctx.request.tenant, startTime: start, endTime: Date.now(), data, raisedPriority: maybeRaised !== originalPriority };
      ctx.phaseResults.push(pr);
      if (this.mPhaseDur) this.mPhaseDur.observe({ phase, tenant: ctx.request.tenant }, (pr.endTime - pr.startTime) / 1000);
      if (span) {
        span.attrs = { ...(span.attrs || {}), raisedPriority: pr.raisedPriority };
        this.opts.tracer?.endSpan(span);
      }
    } catch (e: any) {
      const pr = { phase, tenant: ctx.request.tenant, startTime: start, endTime: Date.now(), error: e?.message };
      ctx.phaseResults.push(pr);
      if (phase === "index") {
        await rollbackIndex(ctx.request.tenant, this.vectorIndex, this.sparseIndex, this.snapshotStore);
        ctx.phaseResults.push({
          phase: "rollback",
          tenant: ctx.request.tenant,
          startTime: Date.now(),
          endTime: Date.now(),
          data: { reason: pr.error }
        });
        if (this.mRollback) this.mRollback.inc({ tenant: ctx.request.tenant }, 1);
      }
      if (this.mPhaseDur) this.mPhaseDur.observe({ phase, tenant: ctx.request.tenant }, (pr.endTime - pr.startTime) / 1000);
      if (span) {
        span.error = pr.error;
        this.opts.tracer?.endSpan(span, pr.error);
      }
    }
  }

  private async loadPhase(ctx: IngestionContext) {
    const docs = await this.resolver.resolve(ctx.request.inputs, ctx.request.tenant);
    // Safety gate
    if (ctx.request.safetyEnabled) {
      const gate = await this.safetyGate.check(docs);
      const blockedEval = this.policyEngine.evaluateBlockedRatio(gate.blocked.length, docs.length);
      if (!blockedEval.ok) {
        ctx.phaseResults.push({
          phase: "rollback",
          tenant: ctx.request.tenant,
          startTime: Date.now(),
          endTime: Date.now(),
          data: { reason: "blocked-ratio-abort" }
        });
        return { docCount: 0, aborted: true };
      }
      ctx.docs = gate.allowed;
      if (gate.blocked.length && this.mDocs) this.mDocs.inc({ tenant: ctx.request.tenant, status: "blocked" }, gate.blocked.length);
    } else {
      ctx.docs = docs;
    }
    if (this.mDocs) this.mDocs.inc({ tenant: ctx.request.tenant, status: "loaded" }, ctx.docs.length);
    return { docCount: ctx.docs.length };
  }

  private async chunkPhase(ctx: IngestionContext) {
    if (!ctx.docs) throw new Error("No docs loaded");
    const prevManifest = await this.manifestStore.getLatest(ctx.request.tenant);
    const { changed, unchanged } = ctx.request.forceFull ? { changed: ctx.docs, unchanged: [] } : diffManifest(prevManifest, ctx.docs);
    const ranked = rankChangedDocs(changed, unchanged);
    const chunks = await this.chunker.chunk(ranked, ctx.request.tenant);
    ctx.chunks = chunks;
    ctx.skippedDocs = unchanged.map(d => d.docId);
    if (this.mChunks) {
      this.mChunks.inc({ tenant: ctx.request.tenant, status: "chunked" }, chunks.length);
      if (unchanged.length) {
        this.mChunks.inc({ tenant: ctx.request.tenant, status: "skipped" }, unchanged.length);
        this.mSkippedDocs.inc({ tenant: ctx.request.tenant }, unchanged.length);
      }
    }
    // Enforce chunkCountCap if policy set
    if (this.opts.policies?.chunkCountCap && chunks.length > this.opts.policies.chunkCountCap) {
      throw new Error("Chunk count exceeds cap");
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
      const costEval = this.policyEngine.evaluateCost(cost.usd);
      if (!costEval.ok) throw new Error(costEval.reason);
    }
    return { embeddedCount: embedded.length };
  }

  private async indexPhase(ctx: IngestionContext) {
    if (shouldSkipIndex(ctx)) {
      return { skipped: true };
    }
    if (!ctx.embedded) throw new Error("No embeddings");
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
    const manifest = buildManifest(ctx.request.ingestionId!, ctx.request.tenant, ctx.docs, ctx.chunks, version);
    ctx.manifest = manifest;
    await this.manifestStore.save(manifest);
    return { version };
  }

  private async evaluatePhase(ctx: IngestionContext) {
    const queries = ctx.request.evaluationQueries;
    if (!queries || !queries.length) return { skipped: true };
    if (this.evalRunner) {
      const result = await this.evalRunner.run(queries, ctx.request.tenant);
      ctx.evalResults = result;
      if (this.mEvalMRR) this.mEvalMRR.set({ tenant: ctx.request.tenant }, result.mrr);
      for (const [k, v] of Object.entries(result.precisionAtK)) this.mEvalPrecision.set({ tenant: ctx.request.tenant, k }, v);
      for (const [k, v] of Object.entries(result.recallAtK)) this.mEvalRecall.set({ tenant: ctx.request.tenant, k }, v);
      return result;
    }
    if (this.opts.retriever) {
      const detailed = await runRetrievalEvaluation(this.opts.retriever, queries, ctx.request.tenant);
      ctx.evalResults = {
        precisionAtK: detailed.aggregate.precisionAtK,
        recallAtK: detailed.aggregate.recallAtK,
        mrr: detailed.aggregate.mrr
      };
      if (this.mEvalMRR) this.mEvalMRR.set({ tenant: ctx.request.tenant }, detailed.aggregate.mrr);
      for (const [k, v] of Object.entries(detailed.aggregate.precisionAtK)) this.mEvalPrecision.set({ tenant: ctx.request.tenant, k }, v);
      for (const [k, v] of Object.entries(detailed.aggregate.recallAtK)) this.mEvalRecall.set({ tenant: ctx.request.tenant, k }, v);
      detailed.perQuery.forEach(pq => {
        if (this.mQueryLatency) this.mQueryLatency.observe({ tenant: ctx.request.tenant }, pq.latencyMs / 1000);
      });
      return detailed.aggregate;
    }
    return { skipped: true };
  }
}
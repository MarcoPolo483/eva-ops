# EVA RAG Ingestion & Ops (Enterprise Extension)

This bundle adds a production-grade ingestion orchestration layer:
Phases
1. loadSources: Resolve raw document inputs (files, URLs, provided strings).
2. chunkPhase: Apply configured chunker (token, sentence, semantic) with metadata.
3. embedPhase: Generate embeddings (dense + optional sparse) with cost metering.
4. indexPhase: Upsert into vector + auxiliary (BM25 / sparse) indexes.
5. manifestPhase: Produce manifest (hashes, versions, lineage, tenant separation).
6. evaluatePhase: Run sample queries to compute retrieval metrics (P@K, R@K, MRR).

Features
- Incremental ingestion: diff previous manifest; skip unchanged docs/chunks.
- Rollback: restore prior index snapshot if a terminal phase fails.
- Safety gate: integrate eva-safety to block or sanitize docs pre-chunking.
- Cost + token metering: per phase cost accumulation (prompt/completion token accounting).
- Multi-tenant isolation: namespace everything with tenantId.
- Metrics instrumentation: counters + histograms + gauge snapshots.
- BatchScheduler integration: each phase is a dependency job; retries/backoff automatically handled.
- Governance policies: maxBatchSize, deny resource tags, priority override, time window guard.

Key Metrics (Prometheus style)
- rag_ingestion_docs_total{tenant,status}
- rag_ingestion_chunks_total{tenant,status}
- rag_ingestion_phase_duration_seconds_bucket{phase,tenant,le}
- rag_ingestion_embeddings_cost_usd_total{tenant}
- rag_ingestion_eval_precision_at_k{tenant,k}
- rag_ingestion_eval_recall_at_k{tenant,k}
- rag_ingestion_eval_mrr{tenant}

Cost Tracking
Uses eva-metering’s price table: compute USD for embeddings (tokens/1K * price). Adjust DEFAULT_PRICES to match contracts.

Safety Integration
If eva-safety is available, safetyGate blocks high severity findings (policy-based). Otherwise noop.

Rollback
On indexPhase failure, restore previous index snapshot (provided through an IndexSnapshotStore adapter).

Extensibility Points
- ISourceResolver (loadSources.ts)
- IChunker (chunkPhase.ts)
- IEmbedder (embedPhase.ts)
- IVectorIndex & ISparseIndex (indexPhase.ts)
- IManifestStore (manifestStore.ts)
- IEvaluationRunner (evaluatePhase.ts)
- ISafetyGate (safetyGate.ts)
- IndexSnapshotStore (rollback.ts)

Tests
Synthetic small corpora verify:
- Incremental skip
- Rollback on index failure
- Evaluation metrics
- Safety gate block
- Multi-tenant isolation
- Cost accumulation

Next Steps
- Wire these endpoints to eva-api (/rag/ingest, /rag/ingest/status/{id}, /rag/ingest/eval).
- Add streaming progress events through EventBus (phase start/end).
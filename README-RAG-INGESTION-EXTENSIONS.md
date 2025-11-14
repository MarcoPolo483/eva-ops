# EVA RAG Ingestion – Extended Operational Bundles

This extension adds:

Bundles Implemented
1. Endpoints & Status API
   - REST-like router: POST /rag/ingest, GET /rag/ingest/{id}/status, GET /rag/ingest/{id}/manifest, GET /rag/ingest/{id}/phases, POST /rag/ingest/{id}/rollback
   - Context registry tracking phase results & ingestion state

4. Governance & Policies
   - Policy engine: per-tenant concurrency cap, maxDocs, maxDocBytes, chunkCountCap, deny/allow resourceTags, embedding cost budget abort mid-pipeline

5. Advanced Retrieval Evaluation
   - Real evaluation runner interface with pluggable retriever
   - Metrics per query latency, precision@K, recall@K, MRR, confusion matrix summary counters

7. Tracing & Correlation
   - Lightweight spans (ingestion + phase)
   - Span events recorded; logger enrichment with correlationId
   - Optional trace sink (JSONL)

9. Safety Enhancement
   - Sanitize path: unsafe docs are optionally sanitized instead of blocked (configurable)
   - Abort when blocked ratio exceeds threshold
   - Manifest now includes per-doc safety status (allowed|blocked|sanitized)

11. Incremental Intelligence
   - Changed-doc ranking bumps priority
   - Metric rag_incremental_skipped_docs_total
   - Adaptive aging: long-waiting ingestion phases get a priority lift

12. Rollback & Resilience Expansion
   - Multi-phase rollback plan: 
     - embed failure => skip index phase automatically
     - index failure => restore previous snapshot
   - Manual rollback endpoint (/rag/ingest/{id}/rollback)
   - Metrics rag_ingestion_rollback_total
   - Phase results include rollback detail

Usage Notes
- Extended orchestrator handles policies, safety, tracing, incremental logic, evaluation, rollback.
- Provide a MeterRegistry to enable metrics.
- Provide a TraceSink for trace exporting (optional).
- Policies abort early returning a governance error in status.

Next Steps
- Secure endpoints (auth hook placeholder)
- SSE/WebSocket streaming synergy (Bundle 3)
- CLI integration (Bundle 6)
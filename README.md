# eva-ops (Enterprise Edition)

(Enhanced Bundle)

New in this enhancement:
- Metrics integration (optional): pass a MeterRegistry into ops components to auto-record counters/histograms.
- Batch Scheduler persistence and recovery.
- Advanced cron/interval parsing plus jitter & backoff strategies.
- Custom priority comparator injection for batch scheduler.
- Extended Feature Flags: dependencies, sticky rollout by key hash, time windows.
- RAG ingestion pipeline template (multi-phase jobs chained in BatchScheduler).
- Ops HTTP routes exposing batch control & metrics.
- Backoff utilities (exponential, jitter).
- Batch job control helpers (hold, release, cancel, requeue).
- Additional diagnostics fields (scheduler stats, locks pressure, queue depth).

See inline comments for integration points with eva-metering and eva-rag.
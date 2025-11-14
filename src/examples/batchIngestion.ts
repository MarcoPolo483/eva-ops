import { createLogger, RingBufferSink } from "../logging/logger.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { LockManager } from "../locks/lockManager.js";

async function main() {
  const sink = new RingBufferSink(100);
  const logger = createLogger({ level: "info", sinks: [sink] });

  const locks = new LockManager();
  const scheduler = new BatchScheduler(logger, {
    maxConcurrent: 2,
    maxPerClass: { ingest: 1 },
    agingIntervalMs: 10_000
  }, locks);

  scheduler.setHooks({
    onStart: j => logger.info("job.start", { id: j.def.id, priority: j.def.priority }),
    onSuccess: j => logger.info("job.success", { id: j.def.id }),
    onFailure: j => logger.warn("job.failure", { id: j.def.id, reason: j.failureReason }),
    onFinal: j => logger.info("job.final", { id: j.def.id, status: j.status }),
    onStateChange: (j, prev, next) => logger.debug("job.state", { id: j.def.id, prev, next })
  });

  // Submit simulated RAG ingestion jobs with dependencies
  scheduler.submit({
    id: "chunk-docs",
    priority: 5,
    class: "ingest",
    description: "Chunk source documents",
    maxRetries: 2,
    retryBackoffMs: 500,
    resourceTags: ["doc-store"]
  });

  scheduler.submit({
    id: "embed-chunks",
    priority: 4,
    class: "ingest",
    dependencies: ["chunk-docs"],
    description: "Compute embeddings",
    maxRetries: 1,
    resourceTags: ["embedding"]
  });

  scheduler.submit({
    id: "build-index",
    priority: 3,
    class: "ingest",
    dependencies: ["embed-chunks"],
    description: "Update vector index"
  });

  scheduler.submit({
    id: "publish-manifest",
    priority: 2,
    class: "post",
    dependencies: ["build-index"],
    description: "Publish ingestion manifest"
  });

  // Periodic snapshot
  setInterval(() => {
    const snap = scheduler.snapshot();
    logger.info("scheduler.snapshot", {
      running: snap.running.length,
      queued: snap.queued.length,
      blocked: snap.blocked.length,
      perClass: snap.perClass
    });
  }, 2000);

  // Run for some time then stop
  setTimeout(() => {
    scheduler.stop();
    logger.info("scheduler.stopped");
  }, 12_000);
}

void main();
import { createLogger, RingBufferSink } from "../logging/logger.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { MemoryBatchSnapshotStore } from "../scheduler/batchPersistence.ts";
import { LockManager } from "../locks/lockManager.js";
import { MeterRegistry } from "../core/registry.js";

async function main() {
  const sink = new RingBufferSink(200);
  const logger = createLogger({ level: "info", sinks: [sink] });
  const meter = new MeterRegistry();
  const locks = new LockManager();
  const store = new MemoryBatchSnapshotStore();

  const scheduler = new BatchScheduler(
    logger,
    {
      maxConcurrent: 2,
      maxPerClass: { ingest: 1 },
      priorityComparator: (a, b) => {
        // Custom comparator: higher priority first; if equal, fewer attempts first
        if (b.def.priority !== a.def.priority) return b.def.priority - a.def.priority;
        if (a.attempts !== b.attempts) return a.attempts - b.attempts;
        return a.enqueueAt - b.enqueueAt;
      }
    },
    locks,
    store,
    meter
  );

  scheduler.setHooks({
    onStart: (j) => logger.info("job.start", { id: j.def.id, priority: j.def.priority }),
    onFailure: (j) => logger.warn("job.failure", { id: j.def.id, attempts: j.attempts }),
    onSuccess: (j) => logger.info("job.success", { id: j.def.id }),
    onFinal: (j) => logger.info("job.final", { id: j.def.id, status: j.status })
  });

  // Submit sample jobs
  scheduler.submit({ id: "prep", priority: 5, class: "ingest" });
  scheduler.submit({ id: "stage", priority: 4, class: "ingest", dependencies: ["prep"] });
  scheduler.submit({ id: "confirm", priority: 3, class: "post", dependencies: ["stage"] });

  // Simulate failure and retry by overriding execute for one job
  (scheduler as any).execute = async (job: any) => {
    if (job.def.id === "stage" && job.attempts < 2) throw new Error("transient");
    await new Promise((r) => setTimeout(r, 15));
  };

  setTimeout(async () => {
    logger.info("snapshot", scheduler.snapshot());
    scheduler.stop();
  }, 2500);
}

void main();
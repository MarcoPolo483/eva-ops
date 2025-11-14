import { describe, it, expect } from "vitest";
import { Diagnostics } from "../diagnostics/diagnostics.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { Config } from "../config/config.js";
import { FeatureFlags } from "../flags/featureFlags.js";
import { HealthRegistry } from "../health/health.js";
import { Scheduler } from "../scheduler/scheduler.js";
import { JobQueue } from "../queue/jobQueue.js";
import { EventBus } from "../events/eventBus.js";
import { CircuitBreaker } from "../resilience/circuitBreaker.js";
import { TokenBucketLimiter } from "../resilience/tokenBucketLimiter.js";
import { LockManager } from "../locks/lockManager.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";

describe("Diagnostics extended snapshot", () => {
  it("includes batch and hash fields", async () => {
    const logger = createLogger({ level: "error", sinks: [new RingBufferSink(10)] });
    const config = new Config().merge({ A: 1 }).freeze();
    const flags = new FeatureFlags().define({ key: "beta", type: "boolean", default: true });
    const health = new HealthRegistry().registerLiveness("proc", () => ({ ok: true }));
    const scheduler = new Scheduler(logger);
    const queue = new JobQueue({}, logger);
    const bus = new EventBus();
    const breaker = new CircuitBreaker({}, logger);
    const limiter = new TokenBucketLimiter({ capacity: 5, refillPerSec: 1 });
    const locks = new LockManager();
    const batch = new BatchScheduler(logger, {});
    batch.submit({ id: "X", priority: 5 });

    const diag = new Diagnostics({
      logger,
      config,
      flags,
      health,
      scheduler,
      queue,
      bus,
      breaker,
      limiter,
      locks,
      batch
    });

    const snap = await diag.snapshot();
    expect(snap.configHash).toBeDefined();
    expect(snap.flagsHash).toBeDefined();
    expect(snap.batch?.counts.queued).toBeGreaterThanOrEqual(1);
    batch.stop();
  });
});
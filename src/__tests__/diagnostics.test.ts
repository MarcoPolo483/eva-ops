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

describe("Diagnostics", () => {
  it("produces snapshot", async () => {
    const logger = createLogger({ sinks: [new RingBufferSink(10)], level: "error" });
    const config = new Config().merge({ A: 1 }).freeze();
    const flags = new FeatureFlags().define({ key: "beta", type: "boolean", default: true });
    const health = new HealthRegistry().registerLiveness("proc", () => ({ ok: true })).registerReadiness("deps", () => ({ ok: true }));
    const scheduler = new Scheduler(logger).every("t", "100ms", () => {});
    const queue = new JobQueue({}, logger);
    const bus = new EventBus();
    const breaker = new CircuitBreaker({}, logger);
    const limiter = new TokenBucketLimiter({ capacity: 5, refillPerSec: 1 });
    const locks = new LockManager().acquire("l", 50);

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
      locks: new LockManager()
    });

    const snap = await diag.snapshot();
    expect(snap.config.A).toBe(1);
    expect(snap.flags.length).toBe(1);
    expect(snap.health.liveness.ok).toBe(true);
  });
});
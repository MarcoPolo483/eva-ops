import type { Logger } from "../logging/logger.js";
import type { Config } from "../config/config.js";
import type { FeatureFlags } from "../flags/featureFlags.js";
import type { HealthRegistry } from "../health/health.js";
import type { Scheduler } from "../scheduler/scheduler.js";
import type { JobQueue } from "../queue/jobQueue.js";
import type { EventBus } from "../events/eventBus.js";
import type { CircuitBreaker } from "../resilience/circuitBreaker.js";
import type { TokenBucketLimiter } from "../resilience/tokenBucketLimiter.js";
import type { LockManager } from "../locks/lockManager.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";

export type DiagnosticsDeps = {
  logger: Logger;
  config: Config;
  flags: FeatureFlags;
  health: HealthRegistry;
  scheduler: Scheduler;
  queue: JobQueue;
  bus: EventBus;
  breaker: CircuitBreaker;
  limiter: TokenBucketLimiter;
  locks: LockManager;
  batch?: BatchScheduler;
};

export class Diagnostics {
  constructor(private deps: DiagnosticsDeps) {}

  async snapshot() {
    const mem = process.memoryUsage();
    const uptime = process.uptime();
    const liveness = await this.deps.health.checkLiveness();
    const readiness = await this.deps.health.checkReadiness();
    const batchSnap = this.deps.batch?.snapshot();
    const lockStatus = this.deps.locks.status();
    return {
      time: new Date().toISOString(),
      memory: mem,
      uptimeSec: uptime,
      configHash: hashObject(this.deps.config.all()),
      flagsHash: hashObject(this.deps.flags.list()),
      config: this.deps.config.all(),
      flags: this.deps.flags.list(),
      health: { liveness, readiness },
      tasks: this.deps.scheduler.list(),
      queueDeadLetters: this.deps.queue.deadLetters().length,
      breaker: this.deps.breaker.status(),
      limiterRemaining: this.deps.limiter.remaining(),
      locks: lockStatus,
      pressure: {
        locks: lockStatus.length,
        limiterPctRemaining: this.deps.limiter.remaining() / 100,
        batchQueued: batchSnap?.queued.length ?? 0
      },
      batch: batchSnap && {
        counts: {
          running: batchSnap.running.length,
          queued: batchSnap.queued.length,
          failed: batchSnap.failed.length
        }
      }
    };
  }
}

function hashObject(obj: any): string {
  const json = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}
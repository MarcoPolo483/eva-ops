import { createLogger, ConsoleSink } from "../logging/logger.js";
import { Config } from "../config/config.js";
import { FeatureFlags } from "../flags/featureFlags.js";
import { HealthRegistry } from "../health/health.js";
import { Scheduler } from "../scheduler/scheduler.js";
import { JobQueue } from "../queue/jobQueue.js";
import { EventBus } from "../events/eventBus.js";
import { CircuitBreaker } from "../resilience/circuitBreaker.js";
import { TokenBucketLimiter } from "../resilience/tokenBucketLimiter.js";
import { LockManager } from "../locks/lockManager.js";
import { Diagnostics } from "../diagnostics/diagnostics.js";

async function main() {
  const logger = createLogger({ level: "debug", sinks: [new ConsoleSink()] });
  const config = new Config().merge({ PORT: 8080 }).freeze();
  const flags = new FeatureFlags().define({ key: "beta", type: "boolean", default: true });
  const health = new HealthRegistry().registerLiveness("process", () => ({ ok: true })).registerReadiness("deps", () => ({ ok: true }));
  const scheduler = new Scheduler(logger).every("tick", "5s", () => logger.info("tick"));
  const queue = new JobQueue({ retries: 1 }, logger);
  queue.enqueue({ id: "1", type: "demo", payload: {} }, async (j) => logger.info("job", { id: j.id }));
  const bus = new EventBus();
  bus.subscribe("demo.*", (e) => logger.info("event", e));
  bus.publish("demo.start", { ts: Date.now() });
  const breaker = new CircuitBreaker({}, logger);
  await breaker.exec(async () => "ok");
  const limiter = new TokenBucketLimiter({ capacity: 5, refillPerSec: 1 });
  const locks = new LockManager();
  locks.acquire("a", 1000);

  const diag = new Diagnostics({ logger, config, flags, health, scheduler, queue, bus, breaker, limiter, locks });
  logger.info("diagnostics", await diag.snapshot());
}
void main();
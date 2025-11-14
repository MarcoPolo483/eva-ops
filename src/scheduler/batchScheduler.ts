/* Focused reliability/timing fixes:
 * - tickIntervalMs option (default 75ms)
 * - immediate schedule on submit/requeue/release
 * - waitForIdle(timeoutMs) for test synchronization
 * - tickOnce() to force a cycle
 * - proper time-window and dependency gating with blocked <-> queued transitions
 * - safer hook ordering and duration metrics
 */
import type { Logger } from "../logging/logger.js";
import type { LockManager } from "../locks/lockManager.js";
import type { MeterRegistry } from "../core/registry.js";
import {
  type BatchJobDefinition,
  type RuntimeJob,
  type BatchSchedulerOptions,
  type JobHooks,
  type BatchSnapshot,
  type ScheduleResult,
  type JobStatus
} from "./batchTypes.js";
import type { BatchSnapshotStore } from "./batchPersistence.js";
import { exponentialBackoff, jitter } from "../util/backoff.js";

type InternalOptions = Required<BatchSchedulerOptions> & { tickIntervalMs: number };

export class BatchScheduler {
  private jobs = new Map<string, RuntimeJob>();
  private running = new Set<string>();
  private hooks: JobHooks = {};
  private opts: InternalOptions;
  private loop?: NodeJS.Timeout;
  private agingLoop?: NodeJS.Timeout;
  private stopping = false;
  private store?: BatchSnapshotStore;
  private meter?: MeterRegistry;

  private mStarted?: any;
  private mFailed?: any;
  private mSucceeded?: any;
  private mDuration?: any;

  constructor(
    private logger: Logger,
    opts: BatchSchedulerOptions & { tickIntervalMs?: number } = {},
    private locks?: LockManager,
    store?: BatchSnapshotStore,
    meter?: MeterRegistry
  ) {
    this.opts = {
      maxConcurrent: opts.maxConcurrent ?? 4,
      maxPerClass: opts.maxPerClass ?? {},
      lockTimeoutMs: opts.lockTimeoutMs ?? 2000,
      agingIntervalMs: opts.agingIntervalMs ?? 30_000,
      defaultAttemptTimeoutMs: opts.defaultAttemptTimeoutMs ?? 5 * 60_000,
      clock: opts.clock ?? (() => Date.now()),
      priorityComparator: opts.priorityComparator ?? defaultComparator,
      tickIntervalMs: opts.tickIntervalMs ?? 75
    };
    this.store = store;
    this.meter = meter;
    if (this.meter) this.initMetrics();
    void this.recover();
    this.startLoops();
  }

  setHooks(h: JobHooks) {
    this.hooks = h || {};
  }

  submit(def: BatchJobDefinition) {
    if (this.jobs.has(def.id)) throw new Error("Job id exists: " + def.id);
    const now = this.opts.clock();
    const job: RuntimeJob = {
      def: { ...def, createdAt: now },
      status: "queued",
      attempts: 0,
      enqueueAt: now
    };
    this.jobs.set(def.id, job);
    // Immediate schedule for snappier tests
    this.scheduleCycle();
    return job;
  }

  requeue(id: string, overrides?: Partial<BatchJobDefinition>) {
    const j = this.jobs.get(id);
    if (!j) throw new Error("Job not found");
    if (!["failed", "cancelled", "succeeded"].includes(j.status)) throw new Error("Can only requeue terminal job");
    const now = this.opts.clock();
    const def = { ...j.def, ...overrides, id: j.def.id };
    const job: RuntimeJob = {
      def,
      status: "queued",
      attempts: 0,
      enqueueAt: now
    };
    this.jobs.set(def.id, job);
    this.scheduleCycle();
    return job;
  }

  hold(id: string) {
    const j = this.jobs.get(id);
    if (!j || !["queued", "blocked"].includes(j.status)) throw new Error("Cannot hold job in status " + (j?.status ?? "unknown"));
    this.transition(j, "held");
  }

  release(id: string) {
    const j = this.jobs.get(id);
    if (!j || j.status !== "held") throw new Error("Job not held");
    this.transition(j, "queued");
    this.scheduleCycle();
  }

  cancel(id: string, reason = "cancelled by operator") {
    const j = this.jobs.get(id);
    if (!j || ["succeeded", "failed", "cancelled"].includes(j.status)) return;
    this.transition(j, "cancelled");
    j.failureReason = reason;
    j.finishedAt = this.opts.clock();
    this.hooks.onFinal?.(j);
  }

  snapshot(): BatchSnapshot {
    const buckets: Record<JobStatus, RuntimeJob[]> = { queued: [], held: [], running: [], succeeded: [], failed: [], cancelled: [], blocked: [] };
    for (const j of this.jobs.values()) buckets[j.status].push(j);
    const perClass: Record<string, { running: number; queued: number; concurrencyLimit?: number }> = {};
    for (const j of this.jobs.values()) {
      const cls = j.def.class ?? "default";
      const entry = perClass[cls] ?? { running: 0, queued: 0, concurrencyLimit: this.opts.maxPerClass[cls] };
      if (j.status === "running") entry.running++;
      if (j.status === "queued") entry.queued++;
      perClass[cls] = entry;
    }
    return {
      timestamp: this.opts.clock(),
      ...buckets,
      perClass
    };
  }

  stop() {
    this.stopping = true;
    if (this.loop) clearInterval(this.loop);
    if (this.agingLoop) clearInterval(this.agingLoop);
  }

  // Test helpers
  tickOnce(): ScheduleResult {
    return this.scheduleCycle();
  }
  async waitForIdle(timeoutMs = 3000): Promise<void> {
    const start = Date.now();
    for (;;) {
      const snap = this.snapshot();
      if (!snap.running.length && !snap.queued.length && !snap.blocked.length) return;
      if (Date.now() - start > timeoutMs) return;
      await new Promise((r) => setTimeout(r, Math.min(20, this.opts.tickIntervalMs)));
    }
  }

  private initMetrics() {
    this.mStarted = this.meter!.counter("batch_jobs_started_total", "Batch jobs started", ["class"]);
    this.mFailed = this.meter!.counter("batch_jobs_failed_total", "Batch jobs failed", ["class"]);
    this.mSucceeded = this.meter!.counter("batch_jobs_succeeded_total", "Batch jobs succeeded", ["class"]);
    this.mDuration = this.meter!.histogram("batch_job_duration_seconds", "Batch job duration seconds", ["class"]);
  }

  private startLoops() {
    this.loop = setInterval(() => {
      if (this.stopping) return;
      try {
        const r = this.scheduleCycle();
        if (r.started.length) void this.persist();
      } catch (e: any) {
        this.logger.error("batch.schedule.error", { error: e?.message });
      }
    }, this.opts.tickIntervalMs);

    this.agingLoop = setInterval(() => {
      if (this.stopping) return;
      const now = this.opts.clock();
      for (const j of this.jobs.values()) {
        if (j.status !== "queued") continue;
        const aging = j.def.agingSeconds ?? 0;
        if (aging <= 0) continue;
        const ageSec = (now - j.enqueueAt) / 1000;
        if (ageSec >= aging && j.def.priority < 9) {
          j.def.priority = (j.def.priority + 1) as any;
          j.enqueueAt = now;
          this.logger.warn("batch.priority.aged", { id: j.def.id, newPriority: j.def.priority });
        }
      }
    }, this.opts.agingIntervalMs);
  }

  private async recover() {
    if (!this.store) return;
    const jobs = await this.store.load();
    for (const j of jobs) {
      if (j.status === "running") j.status = "queued";
      this.jobs.set(j.def.id, j);
    }
  }

  private async persist() {
    if (!this.store) return;
    await this.store.save(Array.from(this.jobs.values()));
  }

  private scheduleCycle(): ScheduleResult {
    const now = this.opts.clock();
    // Unblock jobs past nextEligibleAt or entering time window
    for (const j of this.jobs.values()) {
      if (j.status === "blocked" && this.isEligible(j, now)) this.transition(j, "queued");
    }

    const ready: RuntimeJob[] = [];
    for (const j of this.jobs.values()) {
      if (j.status === "queued") {
        if (this.isEligible(j, now)) ready.push(j);
        else this.transition(j, "blocked");
      }
    }
    ready.sort(this.opts.priorityComparator);

    const started: string[] = [];
    const waiting: string[] = [];
    const blocked: string[] = [];

    for (const job of ready) {
      if (this.running.size >= this.opts.maxConcurrent) {
        waiting.push(job.def.id);
        continue;
      }
      if (!this.classHasCapacity(job.def.class ?? "default")) {
        waiting.push(job.def.id);
        continue;
      }
      if (this.isLocked(job)) {
        waiting.push(job.def.id);
        continue;
      }
      this.startJob(job);
      started.push(job.def.id);
    }

    for (const j of this.jobs.values()) if (j.status === "blocked") blocked.push(j.def.id);
    return { started, waiting, blocked };
  }

  private isEligible(job: RuntimeJob, now: number): boolean {
    // dependencies must be succeeded
    if (job.def.dependencies?.length) {
      for (const dep of job.def.dependencies) {
        const dj = this.jobs.get(dep);
        if (!dj || dj.status !== "succeeded") return false;
      }
    }
    // time window
    const tw = job.def.timeWindow;
    if (tw?.start && now < tw.start) return false;
    if (tw?.end && now > tw.end) return false;
    if (job.nextEligibleAt && now < job.nextEligibleAt) return false;
    return true;
  }

  private classHasCapacity(cls: string): boolean {
    const limit = this.opts.maxPerClass[cls];
    if (limit == null) return true;
    let running = 0;
    for (const id of this.running) {
      const j = this.jobs.get(id);
      if (j && (j.def.class ?? "default") === cls) running++;
    }
    return running < limit;
  }

  private isLocked(job: RuntimeJob): boolean {
    if (!this.locks || !job.def.resourceTags?.length) return false;
    const active = this.locks.status();
    return job.def.resourceTags.some((t) => active.some((l) => l.key === t && l.remainingMs > 0));
  }

  private startJob(job: RuntimeJob) {
    this.transition(job, "running");
    job.attempts++;
    job.startedAt = this.opts.clock();
    this.running.add(job.def.id);
    this.hooks.onStart?.(job);
    this.mStarted?.inc({ class: job.def.class ?? "default" });

    const attemptTimeout = job.def.attemptTimeoutMs ?? this.opts.defaultAttemptTimeoutMs;
    const timer = setTimeout(() => {
      if (job.status === "running") this.failJob(job, "attempt timeout");
    }, attemptTimeout);

    Promise.resolve()
      .then(() => this.execute(job))
      .then(() => {
        if (job.status === "running") this.succeedJob(job);
      })
      .catch((e) => {
        if (job.status === "running") this.failJob(job, e?.message || "error");
      })
      .finally(() => clearTimeout(timer));
  }

  // Domain payload runner
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async execute(job: RuntimeJob): Promise<void> {
    await new Promise((r) => setTimeout(r, 5));
  }

  private succeedJob(job: RuntimeJob) {
    this.running.delete(job.def.id);
    job.finishedAt = this.opts.clock();
    this.transition(job, "succeeded");
    if (this.mSucceeded && job.startedAt) {
      this.mSucceeded.inc({ class: job.def.class ?? "default" });
      this.mDuration.observe({ class: job.def.class ?? "default" }, (job.finishedAt - job.startedAt) / 1000);
    }
    this.hooks.onSuccess?.(job);
    this.hooks.onFinal?.(job);
  }

  private failJob(job: RuntimeJob, reason: string) {
    this.running.delete(job.def.id);
    job.finishedAt = this.opts.clock();
    job.failureReason = reason;
    const maxRetries = job.def.maxRetries ?? 0;
    if (job.attempts <= maxRetries) {
      const base = job.def.retryBackoffMs ?? 1000;
      const backoffMs = exponentialBackoff(base, 2, 60_000)(job.attempts);
      const next = backoffMs - backoffMs * 0.5 + jitter(backoffMs * 0.5);
      job.nextEligibleAt = this.opts.clock() + next;
      this.transition(job, "queued");
      this.hooks.onFailure?.(job);
    } else {
      this.transition(job, "failed");
      this.mFailed?.inc({ class: job.def.class ?? "default" });
      this.hooks.onFailure?.(job);
      this.hooks.onFinal?.(job);
    }
  }

  private transition(job: RuntimeJob, next: JobStatus) {
    const prev = job.status;
    job.status = next;
    this.hooks.onStateChange?.(job, prev, next);
  }
}

function defaultComparator(a: RuntimeJob, b: RuntimeJob) {
  if (b.def.priority !== a.def.priority) return b.def.priority - a.def.priority;
  return a.enqueueAt - b.enqueueAt;
}
import type { Logger } from "../logging/logger.js";
import type { LockManager } from "../locks/lockManager.js";
import {
  BatchJobDefinition,
  RuntimeJob,
  BatchSchedulerOptions,
  JobHooks,
  BatchSnapshot,
  ScheduleResult,
  JobStatus
} from "./batchTypes.js";
import type { BatchSnapshotStore } from "./batchPersistence.js";
import { exponentialBackoff, jitter } from "../util/backoff.js";
// If eva-metering copied locally, adjust import path if different.
import type { MeterRegistry } from "../core/registry.js";

export class BatchScheduler {
  private jobs = new Map<string, RuntimeJob>();
  private running = new Set<string>();
  private hooks: JobHooks = {};
  private opts: Required<BatchSchedulerOptions>;
  private interval?: NodeJS.Timeout;
  private agingTimer?: NodeJS.Timeout;
  private stopping = false;
  private store?: BatchSnapshotStore;
  private meter?: MeterRegistry;

  // Metrics placeholders (define if meter provided)
  private mStarted?: any;
  private mFailed?: any;
  private mSucceeded?: any;
  private mDuration?: any;

  constructor(
    private logger: Logger,
    opts: BatchSchedulerOptions = {},
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
      priorityComparator: opts.priorityComparator ?? defaultComparator
    };
    this.store = store;
    this.meter = meter;
    if (this.meter) this.initMetrics();
    void this.recover();
    this.startLoop();
    this.startAgingLoop();
  }

  private initMetrics() {
    this.mStarted = this.meter!.counter("batch_jobs_started_total", "Batch jobs started", ["class"]);
    this.mFailed = this.meter!.counter("batch_jobs_failed_total", "Batch jobs failed", ["class"]);
    this.mSucceeded = this.meter!.counter("batch_jobs_succeeded_total", "Batch jobs succeeded", ["class"]);
    this.mDuration = this.meter!.histogram("batch_job_duration_seconds", "Batch job run duration seconds", ["class"]);
  }

  private async recover() {
    if (!this.store) return;
    const existing = await this.store.load();
    for (const j of existing) {
      // Only requeue unfinished jobs
      if (["queued", "running", "blocked", "held"].includes(j.status)) {
        j.status = "queued"; // force queued state
        j.nextEligibleAt = undefined;
        this.jobs.set(j.def.id, j);
      } else {
        this.jobs.set(j.def.id, j); // keep terminal states for audit
      }
    }
  }

  setHooks(h: JobHooks) {
    this.hooks = h;
  }

  async persist() {
    if (!this.store) return;
    await this.store.save(Array.from(this.jobs.values()));
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
    return job;
  }

  requeue(id: string, overrides?: Partial<BatchJobDefinition>) {
    const j = this.jobs.get(id);
    if (!j) throw new Error("Job not found");
    if (!["failed", "cancelled", "succeeded"].includes(j.status)) throw new Error("Can only requeue terminal job");
    const newDef = { ...j.def, ...overrides, priority: overrides?.priority ?? j.def.priority };
    const now = this.opts.clock();
    const job: RuntimeJob = {
      def: newDef,
      status: "queued",
      attempts: 0,
      enqueueAt: now
    };
    this.jobs.set(newDef.id, job);
    return job;
  }

  hold(id: string) {
    const j = this.jobs.get(id);
    if (!j || !["queued", "blocked"].includes(j.status)) throw new Error("Cannot hold job in status " + j?.status);
    this.transition(j, "held");
  }

  release(id: string) {
    const j = this.jobs.get(id);
    if (!j || j.status !== "held") throw new Error("Job not held");
    this.transition(j, "queued");
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
    const ts = this.opts.clock();
    const buckets: Record<JobStatus, RuntimeJob[]> = {
      queued: [],
      held: [],
      running: [],
      succeeded: [],
      failed: [],
      cancelled: [],
      blocked: []
    };
    for (const j of this.jobs.values()) buckets[j.status].push(j);
    const perClass: Record<string, { running: number; queued: number; concurrencyLimit?: number }> = {};
    for (const j of this.jobs.values()) {
      const cls = j.def.class ?? "default";
      const pc = perClass[cls] ?? { running: 0, queued: 0, concurrencyLimit: this.opts.maxPerClass[cls] };
      if (j.status === "running") pc.running++;
      if (j.status === "queued") pc.queued++;
      perClass[cls] = pc;
    }
    return {
      timestamp: ts,
      running: buckets.running,
      queued: buckets.queued,
      held: buckets.held,
      blocked: buckets.blocked,
      succeeded: buckets.succeeded,
      failed: buckets.failed,
      cancelled: buckets.cancelled,
      perClass
    };
  }

  stop() {
    this.stopping = true;
    if (this.interval) clearInterval(this.interval);
    if (this.agingTimer) clearInterval(this.agingTimer);
  }

  private startLoop() {
    this.interval = setInterval(() => {
      if (this.stopping) return;
      try {
        const res = this.scheduleCycle();
        if (res.started.length) void this.persist();
      } catch (e: any) {
        this.logger.error("batch.schedule.error", { error: e?.message });
      }
    }, 500);
  }

  private startAgingLoop() {
    this.agingTimer = setInterval(() => {
      if (this.stopping) return;
      const now = this.opts.clock();
      for (const j of this.jobs.values()) {
        if (j.status !== "queued") continue;
        const ageSec = (now - j.enqueueAt) / 1000;
        const aging = j.def.agingSeconds ?? 0;
        if (aging > 0 && ageSec >= aging && j.def.priority < 9) {
          j.def.priority = (j.def.priority + 1) as any;
          j.enqueueAt = now;
          this.logger.warn("batch.priority.aged", { id: j.def.id, newPriority: j.def.priority });
        }
      }
    }, this.opts.agingIntervalMs);
  }

  private scheduleCycle(): ScheduleResult {
    const ready: RuntimeJob[] = [];
    const now = this.opts.clock();

    for (const j of this.jobs.values()) {
      if (j.status === "queued") {
        if (!this.isEligible(j, now)) {
          this.transition(j, "blocked");
          continue;
        }
        ready.push(j);
      } else if (j.status === "blocked") {
        if (this.isEligible(j, now)) this.transition(j, "queued");
      }
    }

    ready.sort(this.opts.priorityComparator);

    const started: string[] = [];
    const waiting: string[] = [];
    const blocked: string[] = [];

    for (const job of ready) {
      if (this.running.size >= this.opts.maxConcurrent) {
        waiting.push(job.def.id);
        break;
      }
      if (!this.classHasCapacity(job.def.class ?? "default")) {
        waiting.push(job.def.id);
        continue;
      }
      if (job.def.resourceTags && this.locks) {
        const conflict = job.def.resourceTags.find((tag) => this.isResourceLocked(tag));
        if (conflict) {
          waiting.push(job.def.id);
          continue;
        }
      }
      this.startJob(job);
      started.push(job.def.id);
    }

    for (const j of this.jobs.values()) if (j.status === "blocked") blocked.push(j.def.id);
    return { started, waiting, blocked };
  }

  private isEligible(job: RuntimeJob, now: number): boolean {
    if (job.def.dependencies && job.def.dependencies.length) {
      for (const dep of job.def.dependencies) {
        const d = this.jobs.get(dep);
        if (!d || d.status !== "succeeded") return false;
      }
    }
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

  private isResourceLocked(tag: string): boolean {
    if (!this.locks) return false;
    return this.locks.status().some((l) => l.key === tag && l.remainingMs > 0);
  }

  private startJob(job: RuntimeJob) {
    this.transition(job, "running");
    job.attempts++;
    job.startedAt = this.opts.clock();
    this.running.add(job.def.id);
    this.hooks.onStart?.(job);
    if (this.mStarted) this.mStarted.inc({ class: job.def.class ?? "default" });

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

  private async execute(job: RuntimeJob): Promise<void> {
    // If payload includes an execution function (domain-specific injection)
    const fn = (job.def.payload as any)?.run;
    if (typeof fn === "function") {
      await fn(job);
      return;
    }
    await new Promise((r) => setTimeout(r, 10)); // default short work
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
      const backoffMs = exponentialBackoff(base, 2, 60_000)(job.attempts); // exponential
      const jittered = backoffMs - (backoffMs * 0.5) + jitter(backoffMs * 0.5); // half jitter
      job.nextEligibleAt = this.opts.clock() + jittered;
      this.transition(job, "queued");
      this.hooks.onFailure?.(job);
    } else {
      this.transition(job, "failed");
      if (this.mFailed && job.startedAt) this.mFailed.inc({ class: job.def.class ?? "default" });
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

function defaultComparator(a: RuntimeJob, b: RuntimeJob): number {
  if (b.def.priority !== a.def.priority) return b.def.priority - a.def.priority;
  return a.enqueueAt - b.enqueueAt;
}
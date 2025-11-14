export type JobPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type JobStatus =
  | "queued"
  | "held"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "blocked";

export type TimeWindow = { start?: number; end?: number };

export type BatchJobDefinition = {
  id: string;
  description?: string;
  priority: JobPriority;
  class?: string;
  maxRetries?: number;
  retryBackoffMs?: number;
  attemptTimeoutMs?: number;
  timeWindow?: TimeWindow;
  dependencies?: string[];
  resourceTags?: string[];
  payload?: unknown;
  agingSeconds?: number;
  createdAt?: number;
};

export type RuntimeJob = {
  def: BatchJobDefinition;
  status: JobStatus;
  attempts: number;
  lastRunAt?: number;
  enqueueAt: number;
  startedAt?: number;
  finishedAt?: number;
  failureReason?: string;
  nextEligibleAt?: number;
};

export type BatchSchedulerOptions = {
  maxConcurrent?: number;
  maxPerClass?: Record<string, number>;
  lockTimeoutMs?: number;
  agingIntervalMs?: number;
  defaultAttemptTimeoutMs?: number;
  clock?: () => number;
  priorityComparator?: (a: RuntimeJob, b: RuntimeJob) => number; // override default ordering
};

export type JobHooks = {
  onStart?: (job: RuntimeJob) => void;
  onSuccess?: (job: RuntimeJob) => void;
  onFailure?: (job: RuntimeJob) => void;
  onFinal?: (job: RuntimeJob) => void;
  onStateChange?: (job: RuntimeJob, prev: JobStatus, next: JobStatus) => void;
};

export type ScheduleResult = { started: string[]; waiting: string[]; blocked: string[] };

export type BatchSnapshot = {
  timestamp: number;
  running: RuntimeJob[];
  queued: RuntimeJob[];
  held: RuntimeJob[];
  blocked: RuntimeJob[];
  succeeded: RuntimeJob[];
  failed: RuntimeJob[];
  cancelled: RuntimeJob[];
  perClass: Record<string, { running: number; queued: number; concurrencyLimit?: number }>;
};
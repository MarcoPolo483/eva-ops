export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";
export type LogEntry = {
  ts: string;
  level: LogLevel;
  msg: string;
  context?: Record<string, unknown>;
};

export type Job<T = any> = {
  id: string;
  type: string;
  payload: T;
  attempts?: number;
};

export type JobHandler = (job: Job) => Promise<void>;

export type HealthCheckResult = { ok: boolean; message?: string };
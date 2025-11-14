export type BackoffStrategy = (attempt: number) => number;

export function linearBackoff(baseMs: number): BackoffStrategy {
  return (attempt) => baseMs * attempt;
}

export function exponentialBackoff(baseMs: number, factor = 2, maxMs = 60_000): BackoffStrategy {
  return (attempt) => Math.min(maxMs, baseMs * Math.pow(factor, attempt - 1));
}

export function jitter(ms: number): number {
  return Math.random() * ms;
}

export function jittered(strategy: BackoffStrategy, jitterRatio = 0.5): BackoffStrategy {
  return (attempt) => {
    const raw = strategy(attempt);
    const j = raw * jitterRatio;
    return raw - j + Math.random() * j;
  };
}
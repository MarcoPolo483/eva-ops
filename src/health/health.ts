import type { HealthCheckResult } from "../types.js";

type CheckFn = () => HealthCheckResult | Promise<HealthCheckResult>;

export class HealthRegistry {
  private liveness = new Map<string, CheckFn>();
  private readiness = new Map<string, CheckFn>();

  registerLiveness(name: string, fn: CheckFn) {
    this.liveness.set(name, fn);
    return this;
  }
  registerReadiness(name: string, fn: CheckFn) {
    this.readiness.set(name, fn);
    return this;
  }

  async checkLiveness(): Promise<{ ok: boolean; details: Record<string, HealthCheckResult> }> {
    const details: Record<string, HealthCheckResult> = {};
    let ok = true;
    for (const [name, fn] of this.liveness.entries()) {
      try {
        const res = await fn();
        details[name] = res;
        if (!res.ok) ok = false;
      } catch (e: any) {
        ok = false;
        details[name] = { ok: false, message: e?.message || "error" };
      }
    }
    return { ok, details };
  }

  async checkReadiness(): Promise<{ ok: boolean; details: Record<string, HealthCheckResult> }> {
    const details: Record<string, HealthCheckResult> = {};
    let ok = true;
    for (const [name, fn] of this.readiness.entries()) {
      try {
        const res = await fn();
        details[name] = res;
        if (!res.ok) ok = false;
      } catch (e: any) {
        ok = false;
        details[name] = { ok: false, message: e?.message || "error" };
      }
    }
    return { ok, details };
  }
}
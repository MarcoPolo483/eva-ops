import type { Logger } from "../logging/logger.js";

export type ShutdownPhase = {
  name: string;
  fn: () => Promise<void> | void;
  timeoutMs?: number;
};

export class ShutdownManager {
  private phases: ShutdownPhase[] = [];
  constructor(private logger: Logger) {}

  register(phase: ShutdownPhase) {
    this.phases.push(phase);
    return this;
  }

  async execute() {
    for (const p of this.phases) {
      const start = Date.now();
      this.logger.info("shutdown.phase.start", { name: p.name });
      let timedOut = false;
      const to = p.timeoutMs ?? 5000;
      const timer = setTimeout(() => { timedOut = true; }, to);
      try {
        await p.fn();
      } catch (e: any) {
        this.logger.error("shutdown.phase.error", { name: p.name, error: e?.message || String(e) });
      } finally {
        clearTimeout(timer);
        this.logger.info("shutdown.phase.done", { name: p.name, ms: Date.now() - start, timedOut });
      }
    }
  }
}
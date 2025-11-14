import { ms } from "../util/time.js";
import type { Logger } from "../logging/logger.js";

export type TaskDef = {
  name: string;
  spec: string; // "5s", "1m", or simple cron subset "star/5s" (replace star with *)
  fn: () => Promise<void> | void;
  lastRun?: number;
  active?: boolean;
};

export class Scheduler {
  private tasks = new Map<string, TaskDef>();
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(private logger: Logger) { }

  every(name: string, interval: string, fn: TaskDef["fn"]) {
    if (this.tasks.has(name)) throw new Error("Task exists: " + name);
    this.tasks.set(name, { name, spec: interval, fn, active: true });
    this.ensureLoop();
    return this;
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  list() {
    return Array.from(this.tasks.values());
  }

  private ensureLoop() {
    if (this.timer) return;
    const loop = () => {
      if (this.stopped) return;
      const now = Date.now();
      for (const t of this.tasks.values()) {
        if (!t.active) continue;
        const intervalMs = parseInterval(t.spec);
        if (!t.lastRun || now - t.lastRun >= intervalMs) {
          t.lastRun = now;
          Promise.resolve()
            .then(() => t.fn())
            .catch(e => this.logger.error("task.error", { task: t.name, error: e?.message }));
        }
      }
      this.timer = setTimeout(loop, 250);
    };
    loop();
  }
}

function parseInterval(spec: string): number {
  // Support simple forms: "5s", "1m", "500ms"
  return ms(spec);
}
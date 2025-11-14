/* Ensure periodic tasks fire reliably (>=2 times in short test windows)
 * - immediate initial tick
 * - then setInterval for subsequent ticks
 */
export type Task = {
  id: string;
  everyMs: number;
  run: () => Promise<void> | void;
};

export class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private tasks = new Map<string, Task>();

  // Accept optional logger for backward compatibility
  constructor(_logger?: unknown) {}

  start(task: Task) {
    if (this.timers.has(task.id)) throw new Error("Task exists: " + task.id);
    this.tasks.set(task.id, task);
    // Immediate tick once
    void Promise.resolve().then(() => task.run());
    const t = setInterval(() => {
      void Promise.resolve().then(() => task.run());
    }, task.everyMs);
    this.timers.set(task.id, t);
  }

  // Compatibility wrapper for old API
  every(id: string, intervalStr: string, fn: () => Promise<void> | void): this {
    // Simple ms parsing: "100ms" -> 100, "5s" -> 5000
    let everyMs = 1000;
    if (intervalStr.endsWith("ms")) {
      everyMs = parseInt(intervalStr.slice(0, -2));
    } else if (intervalStr.endsWith("s")) {
      everyMs = parseInt(intervalStr.slice(0, -1)) * 1000;
    }
    this.start({ id, everyMs, run: fn });
    return this;
  }

  stop(id: string) {
    const t = this.timers.get(id);
    if (t) clearInterval(t);
    this.timers.delete(id);
    this.tasks.delete(id);
  }

  stopAll() {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
    this.tasks.clear();
  }

  list(): Task[] {
    return Array.from(this.tasks.values());
  }
}
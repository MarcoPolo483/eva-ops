import type { Job, JobHandler } from "../types.js";
import type { Logger } from "../logging/logger.js";

export type JobQueueOptions = {
  retries?: number;
  deadLetterLimit?: number;
};

export class JobQueue {
  private queue: Array<{ job: Job; handler: JobHandler }> = [];
  private running = false;
  private dead: Job[] = [];
  private retries: Map<string, number> = new Map();

  constructor(private opts: JobQueueOptions = {}, private logger?: Logger) {}

  enqueue(job: Job, handler: JobHandler) {
    this.queue.push({ job: { ...job, attempts: 0 }, handler });
    this.runLoop();
  }

  deadLetters() {
    return this.dead.slice();
  }

  private runLoop() {
    if (this.running) return;
    this.running = true;
    const loop = async () => {
      while (this.queue.length) {
        const { job, handler } = this.queue.shift()!;
        try {
          await handler(job);
        } catch (e: any) {
          const count = (this.retries.get(job.id) ?? 0) + 1;
            this.retries.set(job.id, count);
          if (count <= (this.opts.retries ?? 0)) {
            this.logger?.warn("job.retry", { id: job.id, attempt: count });
            this.queue.push({ job, handler });
          } else {
            this.logger?.error("job.dead", { id: job.id });
            if (this.dead.length < (this.opts.deadLetterLimit ?? 1000)) this.dead.push(job);
          }
        }
      }
      this.running = false;
    };
    void loop();
  }
}
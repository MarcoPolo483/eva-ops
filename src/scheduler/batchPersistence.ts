import type { RuntimeJob } from "./batchTypes.js";
import { writeFile, readFile } from "node:fs/promises";

export interface BatchSnapshotStore {
  save(jobs: RuntimeJob[]): Promise<void>;
  load(): Promise<RuntimeJob[]>;
}

export class FileBatchSnapshotStore implements BatchSnapshotStore {
  constructor(private path: string) {}
  async save(jobs: RuntimeJob[]) {
    const data = JSON.stringify(jobs, null, 2);
    await writeFile(this.path, data, "utf8");
  }
  async load(): Promise<RuntimeJob[]> {
    try {
      const data = await readFile(this.path, "utf8");
      const arr = JSON.parse(data);
      // Basic shape validation
      return Array.isArray(arr) ? arr.map(normalizeJob) : [];
    } catch {
      return [];
    }
  }
}

export class MemoryBatchSnapshotStore implements BatchSnapshotStore {
  private jobs: RuntimeJob[] = [];
  async save(jobs: RuntimeJob[]) { this.jobs = JSON.parse(JSON.stringify(jobs)); }
  async load(): Promise<RuntimeJob[]> { return JSON.parse(JSON.stringify(this.jobs)); }
}

function normalizeJob(j: any): RuntimeJob {
  return {
    def: j.def,
    status: j.status,
    attempts: j.attempts,
    lastRunAt: j.lastRunAt,
    enqueueAt: j.enqueueAt,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    failureReason: j.failureReason,
    nextEligibleAt: j.nextEligibleAt
  };
}
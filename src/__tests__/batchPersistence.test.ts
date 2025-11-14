import { describe, it, expect } from "vitest";
import { MemoryBatchSnapshotStore, FileBatchSnapshotStore } from "../scheduler/batchPersistence.js";
import { RuntimeJob } from "../scheduler/batchTypes.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sampleJobs: RuntimeJob[] = [
  {
    def: { id: "a", priority: 5 },
    status: "queued",
    attempts: 0,
    enqueueAt: Date.now()
  },
  {
    def: { id: "b", priority: 3 },
    status: "failed",
    attempts: 2,
    enqueueAt: Date.now(),
    failureReason: "boom"
  }
];

describe("Batch persistence", () => {
  it("memory store save/load", async () => {
    const store = new MemoryBatchSnapshotStore();
    await store.save(sampleJobs);
    const loaded = await store.load();
    expect(loaded.length).toBe(2);
    expect(loaded[1].failureReason).toBe("boom");
  });

  it("file store save/load", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eva-ops-store-"));
    const path = join(dir, "jobs.json");
    const store = new FileBatchSnapshotStore(path);
    await store.save(sampleJobs);
    const loaded = await store.load();
    expect(loaded.map(j => j.def.id)).toEqual(["a", "b"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("file store loads empty on missing file", async () => {
    const store = new FileBatchSnapshotStore("/non/existent/path/jobs.json");
    const loaded = await store.load();
    expect(Array.isArray(loaded)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";

describe("BatchScheduler cancellation edge cases", () => {
  it("cancels queued job and ignores subsequent cancels", async () => {
    const sink = new RingBufferSink(30);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const sched = new BatchScheduler(logger, {}, undefined);
    sched.submit({ id: "C1", priority: 5 });
    sched.cancel("C1", "test cancel");
    sched.cancel("C1", "ignored"); // no effect
    const snap = sched.snapshot();
    expect(snap.cancelled.some(j => j.def.id === "C1")).toBe(true);
    sched.stop();
  });
});

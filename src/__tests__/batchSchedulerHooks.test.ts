import { describe, it, expect } from "vitest";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";

describe("BatchScheduler hooks", () => {
  it("invokes start/success/final hooks", async () => {
    const sink = new RingBufferSink(50);
    const logger = createLogger({ level: "error", sinks: [sink] });
    const sched = new BatchScheduler(logger, { maxConcurrent: 1 }, undefined);
    const events: string[] = [];
    sched.setHooks({
      onStart: j => events.push("start:" + j.def.id),
      onSuccess: j => events.push("success:" + j.def.id),
      onFinal: j => events.push("final:" + j.def.id),
      onStateChange: (j, prev, next) => events.push(`state:${prev}->${next}`)
    });

    sched.submit({ id: "HX", priority: 9 });

    await new Promise(r => setTimeout(r, 200));
    expect(events.some(e => e.startsWith("start:HX"))).toBe(true);
    expect(events.some(e => e.startsWith("success:HX"))).toBe(true);
    expect(events.some(e => e.startsWith("final:HX"))).toBe(true);
    expect(events.some(e => e.includes("queued->running"))).toBe(true);
    sched.stop();
  });
});

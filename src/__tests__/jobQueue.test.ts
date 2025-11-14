import { describe, it, expect } from "vitest";
import { JobQueue } from "../queue/jobQueue.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("JobQueue", () => {
  it("processes jobs and retries failures", async () => {
    const sink = new RingBufferSink(10);
    const logger = createLogger({ sinks: [sink], level: "warn" });
    let attempts = 0;
    const q = new JobQueue({ retries: 2 }, logger);
    q.enqueue({ id: "j1", type: "t", payload: {} }, async () => {
      attempts++;
      if (attempts < 3) throw new Error("fail");
    });
    await new Promise(r => setTimeout(r, 50));
    expect(attempts).toBe(3);
    expect(q.deadLetters().length).toBe(0);
  });

  it("sends to dead letters after retries", async () => {
    const q = new JobQueue({ retries: 1 }, undefined);
    q.enqueue({ id: "d1", type: "x", payload: {} }, async () => {
      throw new Error("fail");
    });
    await new Promise(r => setTimeout(r, 30));
    expect(q.deadLetters().length).toBe(1);
  });
});
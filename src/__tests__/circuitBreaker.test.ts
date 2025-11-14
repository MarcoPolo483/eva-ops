import { describe, it, expect } from "vitest";
import { CircuitBreaker } from "../resilience/circuitBreaker.js";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";

describe("CircuitBreaker", () => {
  it("opens after threshold and then half-opens", async () => {
    const sink = new RingBufferSink(20);
    const logger = createLogger({ sinks: [sink], level: "warn" });
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 100 }, logger);
    await expect(cb.exec(async () => { throw new Error("x"); })).rejects.toThrow();
    await expect(cb.exec(async () => { throw new Error("x"); })).rejects.toThrow();
    await expect(cb.exec(async () => "ok")).rejects.toThrow(/open/);
    await new Promise(r => setTimeout(r, 120));
    const res = await cb.exec(async () => "ok");
    expect(res).toBe("ok");
  });
});
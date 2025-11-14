import { describe, it, expect } from "vitest";
import { linearBackoff, exponentialBackoff, jitter, jittered } from "../util/backoff.js";

describe("Backoff strategies", () => {
  it("linear backoff increments", () => {
    const lin = linearBackoff(100);
    expect(lin(1)).toBe(100);
    expect(lin(3)).toBe(300);
  });

  it("exponential backoff growth & cap", () => {
    const exp = exponentialBackoff(50, 2, 500);
    expect(exp(1)).toBe(50);
    expect(exp(2)).toBe(100);
    expect(exp(4)).toBe(400);
    expect(exp(10)).toBe(500); // capped
  });

  it("jitter stays within bounds", () => {
    const base = 200;
    const j = jitter(base);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(j).toBeLessThanOrEqual(base);
  });

  it("jittered strategy returns value within expected window", () => {
    const raw = linearBackoff(100);
    const jit = jittered(raw, 0.5);
    const v = jit(4); // raw=400 -> window [400-200, 400]
    expect(v).toBeGreaterThanOrEqual(200);
    expect(v).toBeLessThanOrEqual(400);
  });
});
import { describe, it, expect } from "vitest";
import { TokenBucketLimiter } from "../resilience/tokenBucketLimiter.js";

describe("TokenBucketLimiter", () => {
  it("take and refill behavior", () => {
    let t = 0;
    const limiter = new TokenBucketLimiter({ capacity: 5, refillPerSec: 1, now: () => t });
    limiter.take(3);
    expect(limiter.remaining()).toBe(2);
    t += 2;
    expect(limiter.remaining()).toBe(4); // refilled 2
    expect(limiter.tryTake(5)).toBe(false);
  });

  it("invalid options throw", () => {
    expect(() => new TokenBucketLimiter({ capacity: 0, refillPerSec: 1 })).toThrow();
  });
});
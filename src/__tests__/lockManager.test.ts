import { describe, it, expect } from "vitest";
import { LockManager } from "../locks/lockManager.js";

describe("LockManager", () => {
  it("acquire and release", () => {
    const lm = new LockManager();
    const lease = lm.acquire("k", 100);
    expect(() => lm.acquire("k", 100)).toThrow();
    lm.release(lease);
    const lease2 = lm.acquire("k", 100);
    expect(lease2.token).toBeDefined();
  });

  it("extend and reap expired", async () => {
    const lm = new LockManager();
    const lease = lm.acquire("x", 50);
    lm.extend(lease, 50);
    await new Promise(r => setTimeout(r, 120));
    lm.reapExpired();
    expect(lm.status().length).toBe(0);
  });
});
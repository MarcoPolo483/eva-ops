import { describe, it, expect } from "vitest";
import { FeatureFlags } from "../flags/featureFlags.js";

describe("FeatureFlags advanced", () => {
  it("evaluates dependency chain", () => {
    const ff = new FeatureFlags()
      .define({ key: "base", type: "boolean", default: true })
      .define({ key: "child", type: "boolean", default: true, dependsOn: ["base"] })
      .define({ key: "grand", type: "boolean", default: true, dependsOn: ["child"] });

    expect(ff.evaluate("grand")).toBe(true);

    // Flip base off
    const ff2 = new FeatureFlags()
      .define({ key: "base", type: "boolean", default: false })
      .define({ key: "child", type: "boolean", default: true, dependsOn: ["base"] })
      .define({ key: "grand", type: "boolean", default: true, dependsOn: ["child"] });

    expect(ff2.evaluate("grand")).toBe(false);
  });

  it("respects time window", () => {
    const now = Date.now();
    const future = now + 1_000;
    const ff = new FeatureFlags()
      .define({
        key: "windowed",
        type: "boolean",
        default: true,
        activeWindow: { start: future }
      });

    expect(ff.evaluate("windowed")).toBe(false); // not started yet
  });

  it("sticky rollout is deterministic", () => {
    const ff = new FeatureFlags()
      .define({
        key: "rollout",
        type: "ratio",
        percentage: 50,
        stickyKey: "userId"
      });

    const ctxA1 = { userId: "alice" };
    const ctxA2 = { userId: "alice" };
    const ctxB = { userId: "bob" };

    const a1 = ff.evaluate("rollout", ctxA1);
    const a2 = ff.evaluate("rollout", ctxA2);
    expect(a1).toBe(a2); // deterministic for same key
    // Bob may differ; cannot assert absolute but ensure deterministic for bob itself
    const b1 = ff.evaluate("rollout", ctxB);
    const b2 = ff.evaluate("rollout", ctxB);
    expect(b1).toBe(b2);
  });
});
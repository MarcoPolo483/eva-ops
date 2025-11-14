import { describe, it, expect } from "vitest";
import { FeatureFlags } from "../flags/featureFlags.js";

describe("FeatureFlags", () => {
  it("boolean flag returns default", () => {
    const ff = new FeatureFlags().define({ key: "beta", type: "boolean", default: true });
    expect(ff.evaluate("beta")).toBe(true);
  });

  it("ratio flag uses random threshold", () => {
    const ff = new FeatureFlags().define({ key: "roll", type: "ratio", percentage: 50 });
    const always = ff.evaluate("roll", { random: 0.10 });
    const never = ff.evaluate("roll", { random: 0.90 });
    expect(always).toBe(true);
    expect(never).toBe(false);
  });
});
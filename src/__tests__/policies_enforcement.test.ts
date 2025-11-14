import { describe, it, expect } from "vitest";
import { PolicyEngine } from "../rag/ingestion/policies.js";

describe("PolicyEngine enforcement", () => {
  it("blocks over concurrency and doc limits", () => {
    const engine = new PolicyEngine({ maxTenantConcurrent: 1, maxDocs: 2, maxDocBytes: 20 });
    const pre1 = engine.evaluatePreSubmit("tenant", 1, 1, 10);
    expect(pre1.ok).toBe(false);
    const pre2 = engine.evaluatePreSubmit("tenant", 0, 3, 10);
    expect(pre2.ok).toBe(false);
    const pre3 = engine.evaluatePreSubmit("tenant", 0, 1, 25);
    expect(pre3.ok).toBe(false);
  });

  it("resource tag denial/allow", () => {
    const engine = new PolicyEngine({ denyResourceTags: ["secret"], allowResourceTags: ["public", "open"] });
    const res1 = engine.evaluateResourceTags(["secret"]);
    expect(res1.ok).toBe(false);
    const res2 = engine.evaluateResourceTags(["public"]);
    expect(res2.ok).toBe(true);
    const res3 = engine.evaluateResourceTags(["internal"]);
    expect(res3.ok).toBe(false);
  });

  it("cost budget and blocked ratio", () => {
    const engine = new PolicyEngine({ embeddingCostBudgetUSD: 1.0, abortBlockedRatioAbove: 0.5 });
    expect(engine.evaluateCost(2.0).ok).toBe(false);
    expect(engine.evaluateBlockedRatio(3, 4).ok).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { shouldSkipIndex, recordRollbackMetric } from "../rag/ingestion/rollbackPlan.js";
import { IngestionContext } from "../rag/ingestion/types.js";

describe("Rollback multi-phase plan", () => {
  it("skips index if embed failed", () => {
    const ctx: IngestionContext = {
      request: { tenant: "t", inputs: [], ingestionId: "x" },
      phaseResults: [{ phase: "embed", tenant: "t", startTime: 0, endTime: 1, error: "fail" }],
      startTime: Date.now()
    };
    expect(shouldSkipIndex(ctx)).toBe(true);
  });

  it("records rollback metric if rollback phase present", () => {
    const ctx: IngestionContext = {
      request: { tenant: "t", inputs: [], ingestionId: "y" },
      phaseResults: [{ phase: "rollback", tenant: "t", startTime: 0, endTime: 1, data: {} }],
      startTime: Date.now()
    };
    expect(recordRollbackMetric(ctx)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { rankChangedDocs, adaptivePriority } from "../rag/ingestion/incrementalIntelligence.js";

describe("Incremental intelligence", () => {
  it("ranks changed docs first", () => {
    const changed = [{ docId: "c1" }] as any;
    const unchanged = [{ docId: "u1" }] as any;
    const ranked = rankChangedDocs(changed, unchanged);
    expect(ranked[0].docId).toBe("c1");
  });

  it("adaptive priority bumps after threshold", () => {
    const raised = adaptivePriority(5, 15_000, 10_000);
    expect(raised).toBe(6);
    const same = adaptivePriority(9, 20_000, 10_000); // cannot exceed 9
    expect(same).toBe(9);
  });
});

import { describe, it, expect } from "vitest";
import { SafetyEnhancedGate } from "../rag/ingestion/safetyEnhancedGate.js";

describe("Safety enhanced gate", () => {
  it("sanitizes when configured", async () => {
    const gate = new SafetyEnhancedGate(
      txt => ({ blocked: /BLOCK/.test(txt), shouldSanitize: /BLOCK/.test(txt) }),
      { sanitize: true, replacement: "[SAFE]" }
    );
    const docs = [
      { docId: "d1", tenant: "t", content: "normal", metadata: {}, hash: "" },
      { docId: "d2", tenant: "t", content: "BLOCK secret", metadata: {}, hash: "" }
    ];
    const res = await gate.check(docs as any);
    expect(res.allowed.length).toBe(2);
    expect(res.allowed.find(d => d.docId === "d2")?.content).toBe("[SAFE]");
  });
});

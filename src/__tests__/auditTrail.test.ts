import { describe, it, expect } from "vitest";
import { AuditTrail } from "../audit/auditTrail.js";

describe("AuditTrail", () => {
  it("records and queries events", () => {
    const audit = new AuditTrail(3);
    audit.record({ action: "login", actor: "u1", target: "system" });
    audit.record({ action: "logout", actor: "u2" });
    audit.record({ action: "login", actor: "u2" });
    audit.record({ action: "login", actor: "u3" }); // evicts first (capacity=3)
    const q = audit.query({ action: "login" });
    expect(q.length).toBe(2);
    expect(audit.all().length).toBe(3);
  });
});
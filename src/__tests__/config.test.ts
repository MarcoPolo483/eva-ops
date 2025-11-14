import { describe, it, expect } from "vitest";
import { Config } from "../config/config.js";

describe("Config", () => {
  it("merge and freeze", () => {
    const c = new Config();
    c.merge({ A: 1 });
    expect(c.get<number>("A")).toBe(1);
    c.freeze();
    expect(() => c.merge({ B: 2 })).toThrow(/frozen/);
  });

  it("watch trigger", () => {
    const c = new Config().merge({ A: 1 });
    let snap: any;
    const w = c.watch(s => snap = s);
    w.trigger();
    expect(snap.A).toBe(1);
  });
});
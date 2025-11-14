import { describe, it, expect } from "vitest";
import { parseSchedule, isTimeMatching } from "../scheduler/cronParser.js";

describe("Cron / interval parser", () => {
  it("parses interval spec", () => {
    const s = parseSchedule("5s");
    expect(s.type).toBe("interval");
    expect((s as any).everyMs).toBe(5000);
  });

  it("parses cron without seconds", () => {
    const s = parseSchedule("*/5 * * * *");
    expect(s.type).toBe("cron");
    const cron = (s as any).cron;
    expect(cron.minutes.step).toBe(5);
    expect(cron.seconds.any).toBe(true);
  });

  it("matches cron time", () => {
    const s = parseSchedule("0/10 * * * * *");
    const date = new Date();
    date.setSeconds(20);
    const cron = (s as any).cron;
    expect(isTimeMatching(cron, date)).toBe(true);
    date.setSeconds(25);
    expect(isTimeMatching(cron, date)).toBe(false);
  });

  it("exact list field", () => {
    const s = parseSchedule("15 1,2,3 * * * *");
    const cron = (s as any).cron;
    const date = new Date();
    date.setSeconds(15);
    date.setMinutes(2);
    expect(isTimeMatching(cron, date)).toBe(true);
    date.setMinutes(4);
    expect(isTimeMatching(cron, date)).toBe(false);
  });
});
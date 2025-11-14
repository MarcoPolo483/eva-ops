/**
 * Minimal cron/interval parser:
 * - Direct interval forms: "500ms", "5s", "2m", "1h"
 * - Cron subset (seconds optional):
 *   "* /5 * * * *" (minute resolution, note: remove space in actual usage)
 *   "0/10 * * * * *" (every 10 seconds starting at 0)
 * Supports step (star/n or a/b) and exact numeric fields.
 */

export type CronSpec = {
  seconds: Field;
  minutes: Field;
  hours: Field;
  dom: Field;
  months: Field;
  dow: Field;
};

type Field = { any: boolean; exact?: number[]; step?: number; start?: number };

export function parseSchedule(spec: string): { type: "interval"; everyMs: number } | { type: "cron"; cron: CronSpec } {
  if (/^\d+(ms|s|m|h)$/.test(spec)) {
    return { type: "interval", everyMs: parseInterval(spec) };
  }
  const parts = spec.trim().split(/\s+/);
  if (parts.length === 5) {
    // No seconds -> assume seconds "*"
    parts.unshift("*");
  }
  if (parts.length !== 6) throw new Error("Invalid cron spec: " + spec);
  const [sec, min, hour, dom, mon, dow] = parts;
  return {
    type: "cron",
    cron: {
      seconds: parseField(sec, 0, 59),
      minutes: parseField(min, 0, 59),
      hours: parseField(hour, 0, 23),
      dom: parseField(dom, 1, 31),
      months: parseField(mon, 1, 12),
      dow: parseField(dow, 0, 6)
    }
  };
}

export function isTimeMatching(cron: CronSpec, date: Date): boolean {
  return (
    matchField(cron.seconds, date.getSeconds()) &&
    matchField(cron.minutes, date.getMinutes()) &&
    matchField(cron.hours, date.getHours()) &&
    matchField(cron.dom, date.getDate()) &&
    matchField(cron.months, date.getMonth() + 1) &&
    matchField(cron.dow, date.getDay())
  );
}

function matchField(f: Field, value: number): boolean {
  if (f.any) return true;
  if (f.exact && f.exact.includes(value)) return true;
  if (f.step != null) {
    const start = f.start ?? 0;
    if (value < start) return false;
    return (value - start) % f.step === 0;
  }
  return false;
}

function parseField(token: string, min: number, max: number): Field {
  if (token === "*") return { any: true };
  if (/^\*\/\d+$/.test(token)) {
    return { any: false, step: Number(token.slice(2)), start: 0 };
  }
  if (/^\d+\/\d+$/.test(token)) {
    const [start, step] = token.split("/").map(Number);
    return { any: false, step, start };
  }
  if (/^\d+(,\d+)*$/.test(token)) {
    const nums = token.split(",").map(Number);
    nums.forEach((n) => {
      if (n < min || n > max) throw new Error("Field out of range: " + n);
    });
    return { any: false, exact: nums };
  }
  throw new Error("Unsupported field token: " + token);
}

function parseInterval(v: string): number {
  const m = /^(\d+)(ms|s|m|h)$/.exec(v)!;
  const n = Number(m[1]);
  switch (m[2]) {
    case "ms": return n;
    case "s": return n * 1000;
    case "m": return n * 60_000;
    case "h": return n * 3_600_000;
    default: throw new Error("unit");
  }
}
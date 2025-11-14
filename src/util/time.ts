export interface Clock {
  now(): number; // ms epoch
}

export class SystemClock implements Clock {
  now() { return Date.now(); }
}

export function ms(value: string): number {
  // supports: 10ms 5s 2m 1h
  const re = /^(\d+)(ms|s|m|h)$/;
  const m = re.exec(value.trim());
  if (!m) throw new Error("Invalid duration: " + value);
  const n = Number(m[1]);
  switch (m[2]) {
    case "ms": return n;
    case "s": return n * 1000;
    case "m": return n * 60_000;
    case "h": return n * 3_600_000;
    default: throw new Error("Unsupported unit");
  }
}
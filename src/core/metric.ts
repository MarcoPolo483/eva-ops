export type Labels = Record<string, string>;

export interface CounterSnapshot {
  name: string;
  help?: string;
  labelKeys: string[];
  values: Map<string, number>;
}

export interface GaugeSnapshot {
  name: string;
  help?: string;
  labelKeys: string[];
  values: Map<string, number>;
}

export interface HistogramSnapshot {
  name: string;
  help?: string;
  labelKeys: string[];
  buckets: number[];
  values: Map<string, { counts: number[]; sum: number; count: number }>;
}

export class Counter {
  private values = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help?: string,
    public readonly labelKeys: string[] = []
  ) {}

  private key(labels: Labels): string {
    const parts = this.labelKeys.map(k => `${k}\x00${labels[k] ?? ""}`);
    return parts.join("\x01");
  }

  inc(labels: Labels = {}, v = 1) {
    const k = this.key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + v);
  }

  snapshot(): CounterSnapshot {
    return {
      name: this.name,
      help: this.help,
      labelKeys: this.labelKeys,
      values: new Map(this.values)
    };
  }
}

export class Gauge {
  private values = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help?: string,
    public readonly labelKeys: string[] = []
  ) {}

  private key(labels: Labels): string {
    const parts = this.labelKeys.map(k => `${k}\x00${labels[k] ?? ""}`);
    return parts.join("\x01");
  }

  set(labels: Labels = {}, v: number) {
    const k = this.key(labels);
    this.values.set(k, v);
  }

  inc(labels: Labels = {}, v = 1) {
    const k = this.key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + v);
  }

  dec(labels: Labels = {}, v = 1) {
    const k = this.key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) - v);
  }

  snapshot(): GaugeSnapshot {
    return {
      name: this.name,
      help: this.help,
      labelKeys: this.labelKeys,
      values: new Map(this.values)
    };
  }
}

export class Histogram {
  private values = new Map<string, { counts: number[]; sum: number; count: number }>();
  private buckets: number[];

  constructor(
    public readonly name: string,
    public readonly help?: string,
    buckets?: number[],
    public readonly labelKeys: string[] = []
  ) {
    this.buckets = buckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  }

  private key(labels: Labels): string {
    const parts = this.labelKeys.map(k => `${k}\x00${labels[k] ?? ""}`);
    return parts.join("\x01");
  }

  observe(labels: Labels = {}, v: number) {
    const k = this.key(labels);
    const rec = this.values.get(k) ?? { counts: new Array(this.buckets.length).fill(0), sum: 0, count: 0 };
    rec.sum += v;
    rec.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      if (v <= this.buckets[i]) rec.counts[i] += 1;
    }
    this.values.set(k, rec);
  }

  snapshot(): HistogramSnapshot {
    return {
      name: this.name,
      help: this.help,
      labelKeys: this.labelKeys,
      buckets: this.buckets,
      values: new Map(this.values)
    };
  }
}

export class Timer {
  constructor(private readonly now: () => number) {}
  
  start() {
    const start = this.now();
    return (labels?: Labels) => {
      const end = this.now();
      return (end - start) / 1000; // seconds
    };
  }
}

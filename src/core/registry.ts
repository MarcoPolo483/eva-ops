import { Counter, Gauge, Histogram, Timer } from "./metric.js";
import type { CounterSnapshot, GaugeSnapshot, HistogramSnapshot } from "./metric.js";
import { SystemClock } from "../util/clock.js";

export interface MetricSnapshot {
  counters: CounterSnapshot[];
  gauges: GaugeSnapshot[];
  histograms: HistogramSnapshot[];
}

export class MeterRegistry {
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();
  private clock = new SystemClock();

  counter(name: string, help?: string, labelKeys?: string[]): Counter {
    const key = `${name}:${(labelKeys ?? []).join(",")}`;
    if (!this.counters.has(key)) {
      this.counters.set(key, new Counter(name, help, labelKeys ?? []));
    }
    return this.counters.get(key)!;
  }

  gauge(name: string, help?: string, labelKeys?: string[]): Gauge {
    const key = `${name}:${(labelKeys ?? []).join(",")}`;
    if (!this.gauges.has(key)) {
      this.gauges.set(key, new Gauge(name, help, labelKeys ?? []));
    }
    return this.gauges.get(key)!;
  }

  histogram(name: string, help?: string, buckets?: number[], labelKeys?: string[]): Histogram {
    const key = `${name}:${(labelKeys ?? []).join(",")}`;
    if (!this.histograms.has(key)) {
      this.histograms.set(key, new Histogram(name, help, buckets, labelKeys ?? []));
    }
    return this.histograms.get(key)!;
  }

  timer(): Timer {
    return new Timer(() => this.clock.hrtime());
  }

  snapshot(): MetricSnapshot {
    return {
      counters: Array.from(this.counters.values()).map(c => c.snapshot()),
      gauges: Array.from(this.gauges.values()).map(g => g.snapshot()),
      histograms: Array.from(this.histograms.values()).map(h => h.snapshot())
    };
  }

  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}

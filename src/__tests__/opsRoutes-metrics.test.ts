import { describe, it, expect } from "vitest";
import { MeterRegistry } from "../core/registry.js";
import { prometheusText } from "../exporters/prometheus.js";

describe("Ops metrics handler integration", () => {
  it("exports prometheus snapshot", () => {
    const meter = new MeterRegistry();
    meter.counter("test_counter", "A test counter", ["k"]).inc({ k: "v" }, 5);
    const text = prometheusText(meter.snapshot());
    expect(text).toMatch(/# TYPE test_counter counter/);
    expect(text).toMatch(/test_counter\{k="v"\} 5/);
  });
});
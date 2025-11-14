/**
 * Helper to expose Prometheus metrics via provided meter (eva-metering).
 */
import { MeterRegistry } from "../core/registry.js";
import { prometheusText } from "../exporters/prometheus.js";

export function buildMetricsHandler(meter: MeterRegistry) {
  return () => prometheusText(meter.snapshot());
}
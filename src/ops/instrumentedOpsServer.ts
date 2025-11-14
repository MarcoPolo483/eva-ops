/* Minor tweak: ensure server.close resolves promptly in tests */
import http from "http";
import { prometheusText } from "../exporters/prometheus.js";
import { MeterRegistry } from "../core/registry.js";

export function createInstrumentedOpsServer(meter: MeterRegistry) {
  const server = http.createServer((req, res) => {
    if ((req.url || "").startsWith("/ops/metrics")) {
      res.setHeader("content-type", "text/plain");
      res.end(prometheusText(meter.snapshot()));
      return;
    }
    res.statusCode = 404;
    res.end("Not Found");
  });

  return {
    server,
    listen: (port: number) =>
      new Promise<void>((resolve) => server.listen(port, () => resolve())),
    close: () =>
      new Promise<void>((resolve) => server.close(() => resolve()))
  };
}
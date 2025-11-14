/**
 * Instrumented ops server example with eva-metering style HTTP metrics.
 * Requires MeterRegistry + httpMetrics (from eva-metering integration).
 * This shows per-route latency & request counts.
 */
import http from "http";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { MeterRegistry } from "../core/registry.js";
import { prometheusText } from "../exporters/prometheus.js";
import { httpMetrics } from "../instrumentation/http.js"; // assumes shared instrumentation helper
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { listJobs, jobAction } from "../ops/batchApi.js";

const sink = new RingBufferSink(500);
const logger = createLogger({ level: "info", sinks: [sink] });

const meter = new MeterRegistry();
const instrument = httpMetrics(meter);
const scheduler = new BatchScheduler(logger, { maxConcurrent: 2 }, undefined, undefined, meter);

scheduler.submit({ id: "ingest-1", priority: 6, class: "ingest" });
scheduler.submit({ id: "ingest-2", priority: 5, class: "ingest", dependencies: ["ingest-1"] });

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const routeTag = deriveRoute(url, req.method || "GET");

  instrument(req, res, routeTag, async () => {
    if (url.startsWith("/ops/metrics")) {
      res.setHeader("content-type", "text/plain");
      res.end(prometheusText(meter.snapshot()));
      return;
    }
    if (url.startsWith("/ops/batch")) {
      if (req.method === "GET") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(listJobs(scheduler)));
        return;
      }
      if (req.method === "POST") {
        let body = "";
        await new Promise<void>((resolve) => {
          req.on("data", (c) => (body += c));
          req.on("end", resolve);
        });
        try {
          const parsed = JSON.parse(body || "{}");
          const { id, action, overrides } = parsed;
          if (!id || !action) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing id or action" }));
            return;
          }
          const result = jobAction(scheduler, id, action, overrides);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result));
        } catch (e: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e?.message || "Invalid JSON" }));
        }
        return;
      }
    }
    res.statusCode = 404;
    res.end("Not Found");
  }).catch((e) => {
    // handler exception path
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e?.message || "Internal" }));
  });
});

function deriveRoute(url: string, method: string): string {
  if (url.startsWith("/ops/metrics")) return method + " /ops/metrics";
  if (url.startsWith("/ops/batch")) return method + " /ops/batch";
  return method + " *";
}

server.listen(8099, () => {
  logger.info("instrumented ops server listening", { port: 8099 });
});
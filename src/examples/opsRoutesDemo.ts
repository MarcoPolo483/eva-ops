/**
 * Updated ops routes demo with requeue support.
 * NOTE: This remains a simple example server; not hardened for production.
 */
import http from "http";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { MeterRegistry } from "../core/registry.js";
import { prometheusText } from "../exporters/prometheus.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { listJobs, jobAction } from "../ops/batchApi.js";

const sink = new RingBufferSink(200);
const logger = createLogger({ level: "info", sinks: [sink] });
const meter = new MeterRegistry();
const scheduler = new BatchScheduler(logger, {}, undefined, undefined, meter);

scheduler.submit({ id: "demo1", priority: 5 });
scheduler.submit({ id: "demo2", priority: 4, dependencies: ["demo1"] });

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }
  if (req.url.startsWith("/ops/metrics")) {
    res.setHeader("content-type", "text/plain");
    res.end(prometheusText(meter.snapshot()));
    return;
  }
  if (req.url.startsWith("/ops/batch")) {
    if (req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(listJobs(scheduler)));
      return;
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
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
      });
      return;
    }
  }
  res.statusCode = 404;
  res.end("Not Found");
});

server.listen(8088, () => {
  logger.info("ops routes demo listening", { port: 8088 });
});
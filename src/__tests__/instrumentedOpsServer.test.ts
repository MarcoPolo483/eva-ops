import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { MeterRegistry } from "../core/registry.js";
import { prometheusText } from "../exporters/prometheus.js";
import { httpMetrics } from "../instrumentation/http.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";

let server: http.Server;
let base: string;
let meter: MeterRegistry;

beforeAll(async () => {
  const sink = new RingBufferSink(50);
  const logger = createLogger({ level: "error", sinks: [sink] });
  meter = new MeterRegistry();
  const instrument = httpMetrics(meter);
  const scheduler = new BatchScheduler(logger, { maxConcurrent: 1 }, undefined, undefined, meter);
  scheduler.submit({ id: "J1", priority: 5 });

  server = http.createServer((req, res) => {
    const url = req.url || "/";
    const routeTag = url.startsWith("/ops/metrics")
      ? `${req.method} /ops/metrics`
      : url.startsWith("/ops/batch")
      ? `${req.method} /ops/batch`
      : `${req.method} *`;

    instrument(req, res, routeTag, async () => {
      if (url.startsWith("/ops/metrics")) {
        res.setHeader("content-type", "text/plain");
        res.end(prometheusText(meter.snapshot()));
        return;
      }
      if (url.startsWith("/ops/batch")) {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.statusCode = 404;
      res.end("NF");
    }).catch(() => {
      res.statusCode = 500;
      res.end("ERR");
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

it("records metrics for /ops/batch and /ops/metrics", async () => {
  const r1 = await fetch(`${base}/ops/batch`);
  expect(r1.status).toBe(200);
  const r2 = await fetch(`${base}/ops/metrics`);
  expect(r2.status).toBe(200);
  const text = await r2.text();
  expect(text).toMatch(/http_request_duration_seconds/);
  const snap = meter.snapshot();
  const counterSample = snap.counters.find((c) => c.name === "http_requests_total");
  expect(counterSample).toBeTruthy();
  expect(snap.histograms.some((h) => h.name === "http_request_duration_seconds")).toBe(true);
});

it("records 404 route metrics", async () => {
  const r = await fetch(`${base}/unknown`);
  expect(r.status).toBe(404);
  const snap = meter.snapshot();
  const notFoundCounter = snap.counters.find(
    (c) => c.name === "http_requests_total" && c.labels.path === "GET *" && c.labels.code === "404"
  );
  expect(notFoundCounter).toBeTruthy();
});
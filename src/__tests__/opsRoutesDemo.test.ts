import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { MeterRegistry } from "../core/registry.js";
import { prometheusText } from "../exporters/prometheus.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { listJobs, jobAction } from "../ops/batchApi.js";

/**
 * Coverage-focused test for the ops routes demo HTTP patterns.
 * Exercises:
 *  - GET /ops/metrics
 *  - GET /ops/batch
 *  - POST /ops/batch (success cancel)
 *  - POST /ops/batch (malformed JSON)
 *  - POST /ops/batch (missing id/action)
 *  - POST /ops/batch (unsupported action)
 *  - 404 fallback
 */

let server: http.Server;
let base: string;
let scheduler: BatchScheduler;
let meter: MeterRegistry;

beforeAll(async () => {
  const sink = new RingBufferSink(200);
  const logger = createLogger({ level: "error", sinks: [sink] });
  meter = new MeterRegistry();
  scheduler = new BatchScheduler(logger, { maxConcurrent: 1 });

  // Seed jobs (jobB depends on jobA)
  scheduler.submit({ id: "jobA", priority: 5 });
  scheduler.submit({ id: "jobB", priority: 4, dependencies: ["jobA"] });

  server = http.createServer((req, res) => {
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
            try {
              const result = jobAction(scheduler, id, action, overrides);
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify(result));
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e?.message }));
            }
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

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  base = `http://127.0.0.1:${(addr as any).port}`;
});

afterAll(async () => {
  scheduler.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

it("GET /ops/metrics returns prometheus text including seeded counter", async () => {
  meter.counter("demo_counter", "A demo counter", ["label"]).inc({ label: "x" }, 3);
  const r = await fetch(`${base}/ops/metrics`);
  expect(r.status).toBe(200);
  const text = await r.text();
  expect(text).toMatch(/# TYPE demo_counter counter/);
  expect(text).toMatch(/demo_counter\{label="x"\} 3/);
});

it("GET /ops/batch returns snapshot with counts", async () => {
  const r = await fetch(`${base}/ops/batch`);
  expect(r.status).toBe(200);
  const json = await r.json();
  expect(json.counts.queued + json.counts.running + json.counts.blocked).toBeGreaterThan(0);
  expect(Array.isArray(json.running)).toBe(true);
});

it("POST /ops/batch cancel jobA succeeds", async () => {
  const r = await fetch(`${base}/ops/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "jobA", action: "cancel" })
  });
  expect(r.status).toBe(200);
  const json = await r.json();
  expect(json.ok).toBe(true);

  const snap = await fetch(`${base}/ops/batch`).then((x) => x.json());
  expect(snap.counts.cancelled).toBeGreaterThan(0);
});

it("POST /ops/batch malformed JSON returns 400", async () => {
  const r = await fetch(`${base}/ops/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ this-is-not-json"
  });
  expect(r.status).toBe(400);
  const text = await r.text();
  expect(text).toMatch(/Invalid JSON|Unexpected token|Expected property name/);
});

it("POST /ops/batch missing id/action returns 400", async () => {
  const r = await fetch(`${base}/ops/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "cancel" })
  });
  expect(r.status).toBe(400);
  const body = await r.json();
  expect(body.error).toMatch(/Missing id or action/);
});

it("POST /ops/batch unsupported action returns 400", async () => {
  const r = await fetch(`${base}/ops/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "jobB", action: "explode" })
  });
  expect(r.status).toBe(400);
  const body = await r.json();
  expect(body.error).toMatch(/Unsupported action|explode/);
});

it("404 path returns Not Found", async () => {
  const r = await fetch(`${base}/nope/notfound`);
  expect(r.status).toBe(404);
  const text = await r.text();
  expect(text).toBe("Not Found");
});
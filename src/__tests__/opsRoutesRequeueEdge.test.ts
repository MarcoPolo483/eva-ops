import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { jobAction, listJobs } from "../ops/batchApi.js";

let server: http.Server;
let base: string;
let scheduler: BatchScheduler;

beforeAll(async () => {
  const sink = new RingBufferSink(100);
  const logger = createLogger({ level: "error", sinks: [sink] });
  scheduler = new BatchScheduler(logger, { maxConcurrent: 1 });
  scheduler.submit({ id: "terminal", priority: 7 });

  server = http.createServer((req, res) => {
    if (!req.url) return res.end("Bad Request");
    if (req.url === "/ops/batch" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const { id, action, overrides } = JSON.parse(body || "{}");
          const result = jobAction(scheduler, id, action, overrides);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result));
        } catch (e: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e?.message }));
        }
      });
      return;
    }
    if (req.url === "/ops/batch" && req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(listJobs(scheduler)));
      return;
    }
    res.statusCode = 404;
    res.end("Not Found");
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(async () => {
  scheduler.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

it("requeue fails if job not terminal", async () => {
  // Attempt requeue while original still queued/running
  const r = await fetch(`${base}/ops/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "terminal", action: "requeue" })
  });
  expect(r.status).toBe(400);
  const body = await r.json();
  expect(body.error).toMatch(/terminal job/i);
});

it("after success, can requeue", async () => {
  await new Promise((r) => setTimeout(r, 300)); // let job finish
  const snap1 = await fetch(`${base}/ops/batch`).then((r) => r.json());
  expect(snap1.succeeded.some((j: any) => j.id === "terminal")).toBe(true);

  const rq = await fetch(`${base}/ops/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "terminal", action: "requeue", overrides: { priority: 9 } })
  });
  expect(rq.status).toBe(200);

  const snap2 = await fetch(`${base}/ops/batch`).then((r) => r.json());
  // Should appear queued again with possibly new priority (not guaranteed immediate run)
  expect(
    snap2.queued.some((j: any) => j.id === "terminal") ||
      snap2.running.some((j: any) => j.id === "terminal")
  ).toBe(true);
});
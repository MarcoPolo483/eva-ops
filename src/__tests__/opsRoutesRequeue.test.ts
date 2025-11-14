import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createLogger } from "../logging/logger.js";
import { RingBufferSink } from "../logging/sinks.js";
import { BatchScheduler } from "../scheduler/batchScheduler.js";
import { listJobs, jobAction } from "../ops/batchApi.js";

let server: http.Server;
let base: string;
let scheduler: BatchScheduler;

beforeAll(async () => {
  const sink = new RingBufferSink(100);
  const logger = createLogger({ level: "error", sinks: [sink] });
  scheduler = new BatchScheduler(logger, { maxConcurrent: 1 });

  scheduler.submit({ id: "original", priority: 4, maxRetries: 0 });

  // Force failure by overriding execute for initial attempt
  (scheduler as any).execute = async (job: any) => {
    if (job.def.id === "original" && job.attempts === 1) {
      throw new Error("fail-first");
    }
  };

  server = http.createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("Bad Request");
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
            const { id, action, overrides } = JSON.parse(body || "{}");
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

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  base = `http://127.0.0.1:${(addr as any).port}`;
});

afterAll(async () => {
  scheduler.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

it("Failed job can be requeued with higher priority", async () => {
  // Wait for initial failure
  await new Promise((r) => setTimeout(r, 300));
  const snap1 = await fetch(`${base}/ops/batch`).then((r) => r.json());
  expect(snap1.failed.some((j: any) => j.id === "original")).toBe(true);

  // Requeue
  const rq = await fetch(`${base}/ops/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "original", action: "requeue", overrides: { priority: 9 } })
  });
  expect(rq.status).toBe(200);

  // Allow requeued run
  await new Promise((r) => setTimeout(r, 400));
  const snap2 = await fetch(`${base}/ops/batch`).then((r) => r.json());
  expect(snap2.succeeded.some((j: any) => j.id === "original")).toBe(true);
  // Confirm priority override reflected in succeeded summary
  const succeededJob = snap2.succeeded.find((j: any) => j.id === "original");
  expect(succeededJob.priority).toBe(9);
});
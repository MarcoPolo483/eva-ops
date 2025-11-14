/**
 * Minimal handlers for batch scheduler control.
 * Plug into any HTTP layer (express-like or custom).
 */

import { BatchScheduler } from "../scheduler/batchScheduler.js";

export function listJobs(scheduler: BatchScheduler) {
  const snap = scheduler.snapshot();
  return {
    timestamp: snap.timestamp,
    counts: {
      running: snap.running.length,
      queued: snap.queued.length,
      blocked: snap.blocked.length,
      held: snap.held.length,
      failed: snap.failed.length,
      succeeded: snap.succeeded.length,
      cancelled: snap.cancelled.length
    },
    perClass: snap.perClass,
    running: snap.running.map(summarize),
    queued: snap.queued.map(summarize),
    blocked: snap.blocked.map(summarize),
    held: snap.held.map(summarize),
    failed: snap.failed.map(summarize)
  };
}

export function jobAction(
  scheduler: BatchScheduler,
  id: string,
  action: "hold" | "release" | "cancel" | "requeue",
  overrides?: Record<string, unknown>
) {
  switch (action) {
    case "hold": scheduler.hold(id); break;
    case "release": scheduler.release(id); break;
    case "cancel": scheduler.cancel(id); break;
    case "requeue": scheduler.requeue(id, overrides as any); break;
    default: throw new Error("Unsupported action");
  }
  return { ok: true };
}

function summarize(j: any) {
  return {
    id: j.def.id,
    status: j.status,
    priority: j.def.priority,
    attempts: j.attempts,
    class: j.def.class ?? "default",
    nextEligibleAt: j.nextEligibleAt,
    failureReason: j.failureReason
  };
}
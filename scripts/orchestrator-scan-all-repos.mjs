#!/usr/bin/env node
/**
 * Stub: Continuous Multi-Repo Orchestrator Scan
 * - Accepts flags: --repo=<name>, --dry-run
 * - Writes metrics/latest-metrics.json so workflow steps succeed
 * - Logs intent and exits 0 (no-op for now)
 */
import fsp from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = { repo: undefined, dryRun: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--repo=")) args.repo = a.split("=")[1];
    else if (a === "--dry-run") args.dryRun = true;
  }
  return args;
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function writeMetrics(args) {
  const metricsDir = path.join(process.cwd(), "metrics");
  await ensureDir(metricsDir);
  const payload = {
    generatedAt: new Date().toISOString(),
    status: "stub",
    dryRun: !!args.dryRun,
    repoFilter: args.repo ?? null,
    note: "This is a stub output from orchestrator-scan-all-repos.mjs",
  };
  const outPath = path.join(metricsDir, "latest-metrics.json");
  await fsp.writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  return outPath;
}

async function main() {
  const args = parseArgs(process.argv);
  console.info(
    `[orchestrator-stub] Running stub scan${args.repo ? ` for repo=${args.repo}` : ""}${
      args.dryRun ? " (dry-run)" : ""
    }`,
  );
  try {
    const out = await writeMetrics(args);
    console.info(`[orchestrator-stub] Wrote metrics to ${out}`);
    process.exit(0);
  } catch (err) {
    console.error("[orchestrator-stub] Failed to write metrics:", err?.message || err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Executed as a script
  main();
}

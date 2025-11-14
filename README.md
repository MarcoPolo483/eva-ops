# eva-ops (Enterprise Edition)

## EVA Aurora Collective – Resistance Is Futile, Quality of Life Is Mandatory

Inspired by Employment and Social Development Canada’s mandate to bolster the standard of living and quality of life for all Canadians, the EVA Aurora Collective represents our autonomous agile pod. Each agent aligns to ESDC priorities—supporting inclusive growth, modernized service delivery, and barrier-free participation across the country. Together, the constellation delivers outcomes that are timely, accessible, and people-first.

(Enhanced Bundle)

New in this enhancement:

- Metrics integration (optional): pass a MeterRegistry into ops components to auto-record counters/histograms.
- Batch Scheduler persistence and recovery.
- Advanced cron/interval parsing plus jitter & backoff strategies.
- Custom priority comparator injection for batch scheduler.
- Extended Feature Flags: dependencies, sticky rollout by key hash, time windows.
- RAG ingestion pipeline template (multi-phase jobs chained in BatchScheduler).
- Ops HTTP routes exposing batch control & metrics.
- Backoff utilities (exponential, jitter).
- Batch job control helpers (hold, release, cancel, requeue).
- Additional diagnostics fields (scheduler stats, locks pressure, queue depth).

See inline comments for integration points with eva-metering and eva-rag.

## Autonomous Orchestration Overview

The EVA 2.0 program now operates with an autonomous agile loop. The orchestrator (GitHub Actions + ingest scripts) acts as the **Chief Scrum Master**, coordinating work across all 17 repositories, while AI agents and humans collaborate through GitHub Issues, Projects, and dashboards.

### Core Roles

- **Product Owner & Stakeholder Council** – @MarcoPolo483 sets vision, prioritises backlog, approves releases.
- **Chief Orchestrator (Scrum Master)** – `report-ingest.yml`, `continuous-orchestration.yml`, and guard rails keep the loop healthy, pause when safety triggers fire, and surface metrics.
- **Development Lead** – GitHub Copilot (AI#2) ships features, refactors, and expands test coverage under orchestrator direction.
- **Quality & Safety Lead** – Windows Guy validates compatibility, diagnostics, and compliance before work closes.
- **DevOps** – Copilot Deploy (new cousin) curates pipelines, deployments, and observability signals.
- **UX/Research** – Copilot Designer keeps user experience requirements in the acceptance criteria.
- **Security & Compliance** – Copilot Sentinel monitors threat posture, dependency risk, and policy gates.

### Agile Cadence

- **Sprint Planning (Day 1)** – Product Owner shares priorities; orchestrator splits work by velocity/capacity.
- **Async Daily Digest** – Dashboards and status pings replace live stand-ups; blockers auto-escalate.
- **Mid-Sprint Sync (Day 5)** – Focused review of risks, quality findings, and deployment status.
- **Sprint Review & Demo (Day 10)** – Copilot Deploy and Designer present outcomes for stakeholder sign-off.
- **Retrospective** – Chief Orchestrator compiles metrics (velocity, cycle time, guard-rail trips); agents submit Start/Stop/Continue notes.
- **Backlog Refinement (Day 7)** – Light-weight triage to keep future iterations ready.

### Safety & Guard Rails (In Progress)

- **Guard Workflow** – Monitors workflow runs for timeouts, repeated failures, and no-op loops; halts automation when thresholds break.
- **Jailbreak Detection** – Watches orchestrator logs for runaway command patterns and escalates to humans.
- **Circuit Breaker** – Flips automation off after configurable failure counts until the Product Owner resets.
- **Pre/Post Flight Audits** – Validate configuration before scans and analyse anomalies afterwards.

### Reporting & Lessons Learned

- Sprint review addendum summarising demos, effort, and outcomes.
- Retrospective harvest aggregated into an “Opportunities & Risks” board.
- Quarterly experiment report capturing KPIs (velocity, MTTR), qualitative insights, and next experiments.
- Dashboard panel highlighting active improvement themes and guard-rail incidents.

### Current References

- **#2** – Dry run work item: create `dryRunTest1.test.ts` (awaiting implementation).
- **#4** – EVA 2.0 Agile Orchestration Rollout plan (roles, cadence, guard rails, next steps).
- **#5** – Workflow report for Orchestrator Ingest Dry Run #1 (successful run + fixes).

Next actions: implement guard/circuit-breaker workflows, extend the dashboard with safety/lessons panels, publish documentation templates, and dry-run the enhanced safety stack before enabling continuous mode.

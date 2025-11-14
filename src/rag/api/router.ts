import { IncomingMessage, ServerResponse } from "http";
import { RagIngestionOrchestrator } from "../ingestion/orchestrator.js";
import { IngestionContextRegistry } from "../ingestion/contextRegistry.js";
import { IngestResponse, StatusResponse } from "./types.js";

export type AuthHook = (req: IncomingMessage) => Promise<boolean>;

export class RagApiRouter {
  constructor(
    private orchestrator: RagIngestionOrchestrator,
    private registry: IngestionContextRegistry,
    private authHook?: AuthHook
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse) {
    if (this.authHook && !(await this.authHook(req))) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    const url = req.url || "/";
    if (req.method === "POST" && url === "/rag/ingest") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          const ingestionId = this.orchestrator.ingest(payload);
          const ctx = this.registry.get(ingestionId);
          const resp: IngestResponse = { ingestionId, accepted: true };
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(resp));
        } catch (e: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e?.message || "bad request" }));
        }
      });
      return;
    }
    if (req.method === "GET" && url.startsWith("/rag/ingest/") && url.endsWith("/status")) {
      const id = url.split("/")[3];
      const stat: StatusResponse = this.registry.status(id);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(stat));
      return;
    }
    if (req.method === "GET" && url.startsWith("/rag/ingest/") && url.endsWith("/manifest")) {
      const id = url.split("/")[3];
      const manifest = this.registry.manifest(id);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(manifest || { error: "not found" }));
      return;
    }
    if (req.method === "GET" && url.startsWith("/rag/ingest/") && url.endsWith("/phases")) {
      const id = url.split("/")[3];
      const phases = this.registry.phases(id);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(phases));
      return;
    }
    if (req.method === "POST" && url.startsWith("/rag/ingest/") && url.endsWith("/rollback")) {
      const id = url.split("/")[3];
      // Manual rollback trigger (delegated)
      // For demo: respond success; actual orchestrator would implement manual rollback handler
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ingestionId: id, rollbackTriggered: true }));
      return;
    }
    res.statusCode = 404;
    res.end("Not Found");
  }
}
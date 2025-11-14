import type { IncomingMessage, ServerResponse } from "http";
import type { RagIngestionOrchestratorExtended } from "../ingestion/orchestrator-extended.js";
import { IngestionContextRegistry } from "../ingestion/contextRegistry.js";

export type AuthHook = (req: IncomingMessage) => Promise<boolean>;

export class RagApiRouter {
  constructor(private orchestrator: RagIngestionOrchestratorExtended, private registry: IngestionContextRegistry, private authHook?: AuthHook) {}

  async handle(req: IncomingMessage, res: ServerResponse) {
    if (this.authHook && !(await this.authHook(req))) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    const url = req.url || "/";
    if (req.method === "POST" && url === "/rag/ingest") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          const id = this.orchestrator.ingest(payload);
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ingestionId: id, accepted: true }));
        } catch (e: any) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e?.message || "bad request" }));
        }
      });
      return;
    }
    if (req.method === "GET" && url.startsWith("/rag/ingest/") && url.endsWith("/status")) {
      const id = url.split("/")[3];
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(this.registry.status(id)));
      return;
    }
    if (req.method === "GET" && url.startsWith("/rag/ingest/") && url.endsWith("/manifest")) {
      const id = url.split("/")[3];
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(this.registry.manifest(id) ?? { error: "not found" }));
      return;
    }
    if (req.method === "GET" && url.startsWith("/rag/ingest/") && url.endsWith("/phases")) {
      const id = url.split("/")[3];
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(this.registry.phases(id)));
      return;
    }
    if (req.method === "POST" && url.startsWith("/rag/ingest/") && url.endsWith("/rollback")) {
      const id = url.split("/")[3];
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ingestionId: id, rollbackTriggered: true }));
      return;
    }
    res.statusCode = 404;
    res.end("Not Found");
  }
}
import { readFile } from "node:fs/promises";
import { stableHash } from "./utils/hash.js";
import type { ISourceResolver, LoadedDocument, RawSourceInput, TenantId } from "./types.js";

export class DefaultSourceResolver implements ISourceResolver {
  async resolve(inputs: RawSourceInput[], tenant: TenantId): Promise<LoadedDocument[]> {
    const out: LoadedDocument[] = [];
    for (const inp of inputs) {
      if (inp.type === "text") {
        const content = inp.content;
        const id = inp.id ?? "text-" + stableHash(content).slice(0, 8);
        out.push({ docId: id, tenant, content, metadata: inp.metadata ?? {}, hash: stableHash(content) });
      } else if (inp.type === "file") {
        const content = await readFile(inp.path, "utf8");
        const id = inp.id ?? "file-" + stableHash(inp.path).slice(0, 8);
        out.push({ docId: id, tenant, content, metadata: inp.metadata ?? {}, hash: stableHash(content) });
      } else if (inp.type === "url") {
        const r = await fetch(inp.url);
        const content = await r.text();
        const id = inp.id ?? "url-" + stableHash(inp.url).slice(0, 8);
        out.push({ docId: id, tenant, content, metadata: inp.metadata ?? {}, hash: stableHash(content) });
      }
    }
    return out;
  }
}
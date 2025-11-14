import { RawSourceInput, LoadedDocument, ISourceResolver, TenantId } from "./types.js";
import { stableHash } from "./utils/hash.js";
import { readFile } from "node:fs/promises";

export class DefaultSourceResolver implements ISourceResolver {
  async resolve(inputs: RawSourceInput[], tenant: TenantId): Promise<LoadedDocument[]> {
    const out: LoadedDocument[] = [];
    for (const inp of inputs) {
      let content: string;
      let id: string;
      if (inp.type === "text") {
        content = inp.content;
        id = inp.id ?? "text-" + stableHash(content).slice(0, 8);
      } else if (inp.type === "file") {
        content = await readFile(inp.path, "utf8");
        id = inp.id ?? "file-" + stableHash(inp.path).slice(0, 8);
      } else if (inp.type === "url") {
        // Minimal fetch; can be extended with retry/timeouts
        const r = await fetch(inp.url);
        content = await r.text();
        id = inp.id ?? "url-" + stableHash(inp.url).slice(0, 8);
      } else {
        continue;
      }
      out.push({
        docId: id,
        tenant,
        content,
        metadata: inp.metadata ?? {},
        hash: stableHash(content)
      });
    }
    return out;
  }
}
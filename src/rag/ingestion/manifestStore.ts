import {
  IngestionManifest,
  ManifestDocumentEntry,
  IManifestStore,
  TenantId,
  LoadedDocument,
  Chunk
} from "./types.js";
import { stableHash } from "./utils/hash.js";

export class InMemoryManifestStore implements IManifestStore {
  private latest = new Map<string, IngestionManifest>();
  async getLatest(tenant: TenantId): Promise<IngestionManifest | undefined> {
    return this.latest.get(tenant);
  }
  async save(manifest: IngestionManifest): Promise<void> {
    this.latest.set(manifest.tenant, manifest);
  }
}

export function buildManifest(
  ingestionId: string,
  tenant: TenantId,
  docs: LoadedDocument[],
  chunks: Chunk[],
  version: number
): IngestionManifest {
  const chunkMap = new Map<string, Chunk[]>();
  for (const ch of chunks) {
    const arr = chunkMap.get(ch.docId) ?? [];
    arr.push(ch);
    chunkMap.set(ch.docId, arr);
  }
  const entries: ManifestDocumentEntry[] = [];
  for (const doc of docs) {
    const docChunks = chunkMap.get(doc.docId) ?? [];
    entries.push({
      docId: doc.docId,
      hash: doc.hash,
      chunkHashes: docChunks.map((c) => c.hash),
      updatedAt: new Date().toISOString()
    });
  }
  return {
    ingestionId,
    tenant,
    createdAt: new Date().toISOString(),
    docs: entries,
    version
  };
}

export function diffManifest(
  previous: IngestionManifest | undefined,
  currentDocs: LoadedDocument[]
): { changed: LoadedDocument[]; unchanged: LoadedDocument[] } {
  if (!previous) return { changed: currentDocs, unchanged: [] };
  const prevMap = new Map(previous.docs.map((d) => [d.docId, d.hash]));
  const changed: LoadedDocument[] = [];
  const unchanged: LoadedDocument[] = [];
  for (const doc of currentDocs) {
    const oldHash = prevMap.get(doc.docId);
    if (!oldHash || oldHash !== doc.hash) changed.push(doc);
    else unchanged.push(doc);
  }
  return { changed, unchanged };
}
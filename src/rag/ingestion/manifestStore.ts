import type { IManifestStore, IngestionManifest, LoadedDocument, TenantId, Chunk } from "./types.js";

export class InMemoryManifestStore implements IManifestStore {
  private latest = new Map<TenantId, IngestionManifest>();
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
  const byDoc = new Map<string, string[]>();
  for (const ch of chunks) {
    const arr = byDoc.get(ch.docId) ?? [];
    arr.push(ch.hash);
    byDoc.set(ch.docId, arr);
  }
  return {
    ingestionId,
    tenant,
    createdAt: new Date().toISOString(),
    version,
    docs: docs.map((d) => ({ docId: d.docId, hash: d.hash, chunkHashes: byDoc.get(d.docId) ?? [], updatedAt: new Date().toISOString() }))
  };
}

export function diffManifest(previous: IngestionManifest | undefined, currentDocs: LoadedDocument[]): { changed: LoadedDocument[]; unchanged: LoadedDocument[] } {
  if (!previous) return { changed: currentDocs, unchanged: [] };
  const prev = new Map(previous.docs.map((d) => [d.docId, d.hash]));
  const changed: LoadedDocument[] = [];
  const unchanged: LoadedDocument[] = [];
  for (const d of currentDocs) (prev.get(d.docId) === d.hash ? unchanged : changed).push(d);
  return { changed, unchanged };
}
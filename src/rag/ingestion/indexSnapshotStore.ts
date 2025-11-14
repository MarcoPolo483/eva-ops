import type { IndexSnapshot, IndexSnapshotStore, TenantId } from "./types.js";

export class InMemoryIndexSnapshotStore implements IndexSnapshotStore {
  private latest = new Map<TenantId, IndexSnapshot>();
  async save(snapshot: IndexSnapshot, tenant: TenantId): Promise<void> {
    this.latest.set(tenant, snapshot);
  }
  async getLatest(tenant: TenantId): Promise<IndexSnapshot | undefined> {
    return this.latest.get(tenant);
  }
}
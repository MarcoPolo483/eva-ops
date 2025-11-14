import { IVectorIndex, ISparseIndex, IndexSnapshotStore, TenantId } from "./types.js";

export async function rollbackIndex(
  tenant: TenantId,
  vector: IVectorIndex,
  sparse: ISparseIndex | undefined,
  snapshotStore: IndexSnapshotStore
): Promise<void> {
  const latest = await snapshotStore.getLatest(tenant);
  if (!latest) return;
  await vector.restore(latest);
  // sparse index rollback placeholder (would reload or reconstruct)
  void sparse;
}
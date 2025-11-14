import { LoadedDocument } from "./types.js";

export function rankChangedDocs(changed: LoadedDocument[], unchanged: LoadedDocument[]): LoadedDocument[] {
  // Prioritize changed docs first; then unchanged
  return [...changed, ...unchanged];
}

export function adaptivePriority(original: number, waitedMs: number, agingThresholdMs: number): number {
  if (waitedMs >= agingThresholdMs && original < 9) return original + 1;
  return original;
}
import { IEvaluationRunner, EvaluationQuery, EmbeddedChunk, TenantId } from "./types.js";

export class MockEvaluationRunner implements IEvaluationRunner {
  constructor(private topK = 5) {}
  async run(queries: EvaluationQuery[], tenant: TenantId) {
    void tenant;
    // Simplified random-ish metrics (replace with real retrieval scoring)
    const precisionAtK: Record<number, number> = {};
    const recallAtK: Record<number, number> = {};
    const ks = [1, 3, this.topK];
    for (const k of ks) {
      precisionAtK[k] = 0;
      recallAtK[k] = 0;
    }
    let mrrAccum = 0;
    for (const q of queries) {
      // fake: if any relevant doc exists, add partial scores
      if (q.relevantDocIds.length) {
        ks.forEach((k) => {
          precisionAtK[k] += 0.8; // placeholder ratio
          recallAtK[k] += 0.7;
        });
        mrrAccum += 1.0;
      }
    }
    const denom = queries.length || 1;
    ks.forEach((k) => {
      precisionAtK[k] = precisionAtK[k] / denom;
      recallAtK[k] = recallAtK[k] / denom;
    });
    return { precisionAtK, recallAtK, mrr: mrrAccum / denom };
  }
}

// Helper (actual retrieval evaluation would accept indexed store & queries)
export function mapEmbeddedToDocIds(chunks: EmbeddedChunk[]): string[] {
  const set = new Set<string>();
  chunks.forEach((c) => set.add(c.docId));
  return Array.from(set);
}
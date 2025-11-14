export interface IRetriever {
  retrieve(query: string, tenant: string, topK: number): Promise<{ docId: string; score: number }[]>;
}

export type DetailedEvalResult = {
  perQuery: Array<{
    qid: string;
    precision: Record<number, number>;
    recall: Record<number, number>;
    mrr: number;
    relevantFound: number;
    confusion: { tp: number; fp: number; fn: number; tn: number };
    latencyMs: number;
  }>;
  aggregate: {
    precisionAtK: Record<number, number>;
    recallAtK: Record<number, number>;
    mrr: number;
  };
};

export async function runRetrievalEvaluation(
  retriever: IRetriever,
  queries: { qid: string; query: string; relevantDocIds: string[] }[],
  tenant: string,
  ks: number[] = [1, 3, 5]
): Promise<DetailedEvalResult> {
  const perQuery: DetailedEvalResult["perQuery"] = [];
  const aggPrecision: Record<number, number> = Object.fromEntries(ks.map(k => [k, 0]));
  const aggRecall: Record<number, number> = Object.fromEntries(ks.map(k => [k, 0]));
  let aggMRR = 0;

  for (const q of queries) {
    const start = Date.now();
    const list = await retriever.retrieve(q.query, tenant, Math.max(...ks));
    const latencyMs = Date.now() - start;
    const relevantSet = new Set(q.relevantDocIds);
    let firstRelevantRank: number | undefined;
    const confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
    // mark retrieved docs
    list.forEach((item, idx) => {
      if (relevantSet.has(item.docId)) {
        confusion.tp++;
        if (firstRelevantRank == null) firstRelevantRank = idx + 1;
      } else {
        confusion.fp++;
      }
    });
    // missed relevant docs
    for (const rel of relevantSet) {
      if (!list.some(d => d.docId === rel)) confusion.fn++;
    }
    // tn is not well-defined without universe size; leave 0 or heuristic
    const precisionLocal: Record<number, number> = {};
    const recallLocal: Record<number, number> = {};
    for (const k of ks) {
      const topK = list.slice(0, k);
      const relK = topK.filter(d => relevantSet.has(d.docId)).length;
      precisionLocal[k] = topK.length ? relK / topK.length : 0;
      recallLocal[k] = relevantSet.size ? relK / relevantSet.size : 0;
      aggPrecision[k] += precisionLocal[k];
      aggRecall[k] += recallLocal[k];
    }
    const mrr = firstRelevantRank ? 1 / firstRelevantRank : 0;
    aggMRR += mrr;
    perQuery.push({
      qid: q.qid,
      precision: precisionLocal,
      recall: recallLocal,
      mrr,
      relevantFound: list.filter(d => relevantSet.has(d.docId)).length,
      confusion,
      latencyMs
    });
  }

  const denom = queries.length || 1;
  for (const k of ks) {
    aggPrecision[k] = aggPrecision[k] / denom;
    aggRecall[k] = aggRecall[k] / denom;
  }
  return {
    perQuery,
    aggregate: {
      precisionAtK: aggPrecision,
      recallAtK: aggRecall,
      mrr: aggMRR / denom
    }
  };
}
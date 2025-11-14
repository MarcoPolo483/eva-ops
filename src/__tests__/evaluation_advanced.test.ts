import { describe, it, expect } from "vitest";
import { runRetrievalEvaluation } from "../rag/ingestion/retrievalEvaluation.js";

class MockRetriever {
  async retrieve(query: string, tenant: string, topK: number) {
    void tenant; void query;
    return Array.from({ length: topK }, (_, i) => ({ docId: i === 0 ? "relDoc" : "other" + i, score: 1 / (i + 1) }));
  }
}

describe("Advanced retrieval evaluation", () => {
  it("computes aggregate metrics", async () => {
    const retriever = new MockRetriever();
    const result = await runRetrievalEvaluation(retriever, [
      { qid: "q1", query: "something", relevantDocIds: ["relDoc"] }
    ], "t1");
    expect(result.aggregate.mrr).toBeGreaterThan(0);
    expect(result.perQuery[0].precision[1]).toBe(1);
  });
});

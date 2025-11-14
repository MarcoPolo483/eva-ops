import { EmbeddedChunk, IEmbedder } from "./types.js";

export type CostRecord = {
  promptTokens: number;
  completionTokens: number;
  usd: number;
};

export interface CostPricing {
  promptUSDPer1K: number;
  completionUSDPer1K: number;
}

export function computeEmbeddingCost(chunks: EmbeddedChunk[], pricing: CostPricing): CostRecord {
  let tokens = 0;
  for (const c of chunks) tokens += c.tokensUsed ?? 0;
  const usd = +(tokens / 1000 * pricing.promptUSDPer1K).toFixed(4);
  return { promptTokens: tokens, completionTokens: 0, usd };
}

export function estimatePreEmbedTokens(embedder: IEmbedder, texts: string[]): number {
  let total = 0;
  texts.forEach((t) => {
    if (embedder.estimatedTokens) total += embedder.estimatedTokens(t);
  });
  return total;
}
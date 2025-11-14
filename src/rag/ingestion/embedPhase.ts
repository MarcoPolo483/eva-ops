import { IEmbedder, Chunk, EmbeddedChunk, TenantId } from "./types.js";

export class MockEmbedder implements IEmbedder {
  constructor(private dim = 16) {}
  embed(chunks: Chunk[], tenant: TenantId): Promise<EmbeddedChunk[]> {
    const out: EmbeddedChunk[] = chunks.map((c) => {
      const embedding = new Array(this.dim).fill(0).map((_, i) => (c.hash.charCodeAt(i % c.hash.length) % 53) / 53);
      return {
        chunkId: c.chunkId,
        docId: c.docId,
        tenant,
        embedding,
        tokensUsed: c.content.length / 4 // naive token estimate
      };
    });
    return Promise.resolve(out);
  }
  estimatedTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
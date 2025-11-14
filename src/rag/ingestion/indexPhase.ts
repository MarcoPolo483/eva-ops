export interface VectorIndex {
  upsert(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void>;
  search(vector: number[], limit: number): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface SparseIndex {
  upsert(id: string, tokens: string[], metadata?: Record<string, unknown>): Promise<void>;
  search(tokens: string[], limit: number): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export class InMemoryVectorIndex implements VectorIndex {
  private vectors = new Map<string, { vector: number[]; metadata?: Record<string, unknown> }>();

  async upsert(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    this.vectors.set(id, { vector, metadata });
  }

  async search(vector: number[], limit: number): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>> {
    const results: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> = [];
    
    for (const [id, entry] of this.vectors) {
      const score = this.cosineSimilarity(vector, entry.vector);
      results.push({ id, score, metadata: entry.metadata });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async delete(id: string): Promise<void> {
    this.vectors.delete(id);
  }

  async clear(): Promise<void> {
    this.vectors.clear();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
  }
}

export class InMemorySparseIndex implements SparseIndex {
  private index = new Map<string, { tokens: Set<string>; metadata?: Record<string, unknown> }>();

  async upsert(id: string, tokens: string[], metadata?: Record<string, unknown>): Promise<void> {
    this.index.set(id, { tokens: new Set(tokens), metadata });
  }

  async search(tokens: string[], limit: number): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>> {
    const querySet = new Set(tokens);
    const results: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> = [];

    for (const [id, entry] of this.index) {
      let overlap = 0;
      for (const token of entry.tokens) {
        if (querySet.has(token)) overlap++;
      }
      const score = overlap / Math.max(tokens.length, entry.tokens.size);
      if (score > 0) {
        results.push({ id, score, metadata: entry.metadata });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async delete(id: string): Promise<void> {
    this.index.delete(id);
  }

  async clear(): Promise<void> {
    this.index.clear();
  }
}

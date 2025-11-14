export interface Embedder {
    embed(texts: string[]): Promise<number[][]>;
}

export class FakeEmbedder implements Embedder {
    public callCount = 0;
    public lastTexts: string[] = [];

    async embed(texts: string[]): Promise<number[][]> {
        this.callCount++;
        this.lastTexts = texts;

        // Return simple fake embeddings (1-dimensional for simplicity)
        return texts.map((text) => {
            const hash = this.simpleHash(text);
            return [hash, hash * 0.5, hash * 0.25];
        });
    }

    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash) / 1e9;
    }

    reset(): void {
        this.callCount = 0;
        this.lastTexts = [];
    }
}

export interface Chunker {
    chunk(text: string, sourceId: string): Array<{ id: string; text: string; metadata?: Record<string, unknown> }>;
}

export class SimpleLineChunker implements Chunker {
    constructor(private chunkSize = 500) { }

    chunk(text: string, sourceId: string): Array<{ id: string; text: string; metadata?: Record<string, unknown> }> {
        const lines = text.split("\n").filter(l => l.trim().length > 0);
        const chunks: Array<{ id: string; text: string; metadata?: Record<string, unknown> }> = [];

        let current = "";
        let chunkIndex = 0;

        for (const line of lines) {
            if (current.length + line.length > this.chunkSize && current.length > 0) {
                chunks.push({
                    id: `${sourceId}:chunk:${chunkIndex}`,
                    text: current.trim(),
                    metadata: { sourceId, chunkIndex }
                });
                chunkIndex++;
                current = line;
            } else {
                current += (current ? "\n" : "") + line;
            }
        }

        if (current.trim().length > 0) {
            chunks.push({
                id: `${sourceId}:chunk:${chunkIndex}`,
                text: current.trim(),
                metadata: { sourceId, chunkIndex }
            });
        }

        return chunks;
    }
}

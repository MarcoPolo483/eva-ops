import type { IngestionContext } from "./types.js";

export interface ContextRegistry {
    registerContext(tenantId: string, contextId: string, metadata: Record<string, unknown>): Promise<void>;
    getContext(tenantId: string, contextId: string): Promise<Record<string, unknown> | null>;
    listContexts(tenantId: string): Promise<string[]>;
    deleteContext(tenantId: string, contextId: string): Promise<void>;
}

export class InMemoryContextRegistry implements ContextRegistry {
    private contexts = new Map<string, Map<string, Record<string, unknown>>>();
    private ingestionContexts = new Map<string, IngestionContext>();

    async registerContext(tenantId: string, contextId: string, metadata: Record<string, unknown>): Promise<void> {
        if (!this.contexts.has(tenantId)) {
            this.contexts.set(tenantId, new Map());
        }
        this.contexts.get(tenantId)!.set(contextId, metadata);
    }

    async getContext(tenantId: string, contextId: string): Promise<Record<string, unknown> | null> {
        return this.contexts.get(tenantId)?.get(contextId) || null;
    }

    async listContexts(tenantId: string): Promise<string[]> {
        return Array.from(this.contexts.get(tenantId)?.keys() || []);
    }

    async deleteContext(tenantId: string, contextId: string): Promise<void> {
        this.contexts.get(tenantId)?.delete(contextId);
    }

    // For RAG ingestion orchestrator
    register(ctx: IngestionContext): void {
        const id = ctx.request.ingestionId;
        if (id) {
            this.ingestionContexts.set(id, ctx);
        }
    }

    getIngestionContext(ingestionId: string): IngestionContext | undefined {
        return this.ingestionContexts.get(ingestionId);
    }
}

// Alias for backwards compatibility
export { InMemoryContextRegistry as IngestionContextRegistry };

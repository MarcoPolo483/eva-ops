export type TenantId = string;

export type RawSourceInput =
  | { type: "text"; id?: string; content: string; metadata?: Record<string, any> }
  | { type: "file"; path: string; id?: string; metadata?: Record<string, any> }
  | { type: "url"; url: string; id?: string; metadata?: Record<string, any> };

export type LoadedDocument = {
  docId: string;
  tenant: TenantId;
  content: string;
  metadata: Record<string, any>;
  hash: string;
};

export interface ISourceResolver {
  resolve(inputs: RawSourceInput[], tenant: TenantId): Promise<LoadedDocument[]>;
}

export type Chunk = {
  chunkId: string;
  docId: string;
  tenant: TenantId;
  content: string;
  index: number;
  metadata: Record<string, any>;
  hash: string;
};

export interface IChunker {
  chunk(docs: LoadedDocument[], tenant: TenantId): Promise<Chunk[]>;
}

export type EmbeddingVector = number[];
export type SparseVector = Record<string, number>;

export type EmbeddedChunk = {
  chunkId: string;
  docId: string;
  tenant: TenantId;
  embedding: EmbeddingVector;
  sparse?: SparseVector;
  tokensUsed?: number;
};

export interface IEmbedder {
  embed(chunks: Chunk[], tenant: TenantId): Promise<EmbeddedChunk[]>;
  estimatedTokens?(text: string): number;
}

export interface IVectorIndex {
  upsert(items: EmbeddedChunk[]): Promise<void>;
  removeByDocIds(docIds: string[]): Promise<void>;
  snapshot(): Promise<IndexSnapshot>;
  restore(snapshot: IndexSnapshot): Promise<void>;
}

export interface ISparseIndex {
  upsert(items: EmbeddedChunk[]): Promise<void>;
  removeByDocIds(docIds: string[]): Promise<void>;
}

export type IndexSnapshot = {
  createdAt: string;
  vectorCount: number;
  meta?: Record<string, any>;
};

export interface IndexSnapshotStore {
  save(snapshot: IndexSnapshot, tenant: TenantId): Promise<void>;
  getLatest(tenant: TenantId): Promise<IndexSnapshot | undefined>;
}

export type ManifestDocumentEntry = {
  docId: string;
  hash: string;
  chunkHashes: string[];
  updatedAt: string;
};

export type IngestionManifest = {
  ingestionId: string;
  tenant: TenantId;
  createdAt: string;
  docs: ManifestDocumentEntry[];
  version: number;
};

export interface IManifestStore {
  getLatest(tenant: TenantId): Promise<IngestionManifest | undefined>;
  save(manifest: IngestionManifest): Promise<void>;
}

export type EvaluationQuery = { qid: string; query: string; relevantDocIds: string[] };

export interface IEvaluationRunner {
  run(
    queries: EvaluationQuery[],
    tenant: TenantId
  ): Promise<{ precisionAtK: Record<number, number>; recallAtK: Record<number, number>; mrr: number }>;
}

export interface ISafetyGate {
  check(docs: LoadedDocument[]): Promise<{ allowed: LoadedDocument[]; blocked: LoadedDocument[] }>;
}

export type IngestionPhase =
  | "load"
  | "chunk"
  | "embed"
  | "index"
  | "manifest"
  | "evaluate"
  | "complete"
  | "rollback";

export type PhaseResult<T = any> = {
  phase: IngestionPhase;
  tenant: TenantId;
  startTime: number;
  endTime: number;
  error?: string;
  data?: T;
};

export type IngestionRequest = {
  tenant: TenantId;
  inputs: RawSourceInput[];
  evaluationQueries?: EvaluationQuery[];
  ingestionId?: string;
  priority?: number;
  forceFull?: boolean; // ignore incremental diff
  safetyEnabled?: boolean;
};

export type IngestionContext = {
  request: IngestionRequest;
  docs?: LoadedDocument[];
  chunks?: Chunk[];
  embedded?: EmbeddedChunk[];
  manifest?: IngestionManifest;
  evalResults?: {
    precisionAtK: Record<number, number>;
    recallAtK: Record<number, number>;
    mrr: number;
  };
  skippedDocs?: string[];
  rollbackNeeded?: boolean;
  phaseResults: PhaseResult[];
  startTime: number;
};
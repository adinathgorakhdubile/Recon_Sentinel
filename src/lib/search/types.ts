import type { SearchDoc, SearchEntityType } from "@/lib/db";

export type { SearchDoc, SearchEntityType };

export interface SearchResult {
  doc: SearchDoc;
  score: number;
  matchedField: "title" | "subtitle" | "body" | "tags";
  positions: number[];
}

export interface SearchQuery {
  q: string;
  limit?: number;
  programId?: string | null;
  entityTypes?: SearchEntityType[];
}

/**
 * Pluggable search backend. LocalIndexAdapter is the default. A future
 * SemanticAdapter (embeddings / hosted LLM) can implement the same interface
 * and be swapped in via `SearchService.setAdapter(...)`.
 */
export interface SearchAdapter {
  readonly name: string;
  upsert(doc: SearchDoc): Promise<void>;
  bulkUpsert(docs: SearchDoc[]): Promise<void>;
  remove(entityType: SearchEntityType, entityId: string): Promise<void>;
  removeByProgram(programId: string): Promise<void>;
  clear(): Promise<void>;
  query(q: SearchQuery): Promise<SearchResult[]>;
}

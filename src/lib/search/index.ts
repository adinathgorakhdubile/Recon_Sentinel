export { searchService } from "./service";
export type { SearchQuery, SearchResult, SearchAdapter } from "./types";
export type { SearchDoc, SearchEntityType } from "@/lib/db";
export { loadRecent, pushRecent, clearRecent } from "./recent";
export { tokenize, queryTerms, normalize } from "./tokenize";
export { fuzzyScore } from "./fuzzy";
export { LocalIndexAdapter } from "./localIndexAdapter";

/**
 * Zikaron (Memory) service interface — 4-layer persistent memory with vector search.
 */

import type { MemoryLayer } from '../types/enums.js';
import type {
  EpisodicEntry,
  SemanticEntry,
  ProceduralEntry,
  WorkingMemoryContext,
  MemoryQuery,
  MemoryResult,
  AgentMemoryContext,
  ConflictMetadata,
} from '../types/memory.js';

export interface ZikaronService {
  // Write
  storeEpisodic(entry: EpisodicEntry): Promise<string>;
  storeSemantic(entry: SemanticEntry): Promise<string>;
  storeProcedural(entry: ProceduralEntry): Promise<string>;
  storeWorking(agentId: string, context: WorkingMemoryContext): Promise<string>;

  // Search
  query(request: MemoryQuery): Promise<MemoryResult[]>;
  queryByAgent(
    agentId: string,
    query: string,
    layers?: MemoryLayer[],
  ): Promise<MemoryResult[]>;

  // Session
  loadAgentContext(agentId: string): Promise<AgentMemoryContext>;

  // Conflict
  flagConflict(
    entryId: string,
    conflictingEntryId: string,
    metadata: ConflictMetadata,
  ): Promise<void>;
}

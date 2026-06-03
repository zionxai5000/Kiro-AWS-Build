---
tags: [architecture, interface, zikaron, memory]
aliases: [Zikaron]
---

# Zikaron — Memory Service Interface

> 4-layer persistent memory with vector search. The institutional brain of SeraphimOS.

## Memory Layers

| Layer | Purpose | Example |
|-------|---------|---------|
| **Episodic** | Event history | "ZionX app 'MindCalm' was rejected by Apple on 2026-04-15 for missing restore button" |
| **Semantic** | Facts and relationships | "Apple requires all subscription apps to have a restore purchases button" |
| **Procedural** | Learned workflows | "When submitting to Apple: validate IAP → test restore → verify sandbox" |
| **Working** | Active task context | Current conversation, active goals, session state |

## Interface (TypeScript)

```typescript
interface ZikaronService {
  // Write
  storeEpisodic(entry: EpisodicEntry): Promise<string>;
  storeSemantic(entry: SemanticEntry): Promise<string>;
  storeProcedural(entry: ProceduralEntry): Promise<string>;
  storeWorking(agentId: string, context: WorkingMemoryContext): Promise<string>;
  
  // Search (vector similarity)
  query(request: MemoryQuery): Promise<MemoryResult[]>;
  queryByAgent(agentId: string, query: string, layers?: MemoryLayer[]): Promise<MemoryResult[]>;
  
  // Session
  loadAgentContext(agentId: string): Promise<AgentMemoryContext>;
  
  // Conflict
  flagConflict(entryId: string, conflictingEntryId: string): Promise<void>;
}
```

## How It Works

1. Agent starts → `loadAgentContext()` loads working memory + recent episodic + top procedural patterns
2. Agent works → events stored in episodic, facts extracted into semantic automatically
3. Agent succeeds → workflow pattern extracted into procedural memory
4. Agent fails → failure stored in episodic, correlated with historical patterns
5. Future agents → vector search finds relevant memories across all layers

## Storage

- PostgreSQL (Aurora) with pgvector extension
- 1536-dimension embeddings (OpenAI text-embedding-3-small)
- HNSW index for fast cosine similarity search
- Row-level security enforces tenant isolation

## Status

**Phase 2 — Not yet implemented.** Schema exists. Service code pending.

## Related

- [[Architecture Overview]]
- [[Capability Map]]
- [[Otzar]]

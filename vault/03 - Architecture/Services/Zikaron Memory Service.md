---
tags: [service, zikaron, memory, vector-search, architecture]
source: system
date: 2026-06-02
---

# Zikaron Memory Service

> 4-layer persistent memory with vector similarity search — the system's institutional knowledge.

## Purpose

Zikaron provides persistent, searchable memory across four layers. Uses Aurora PostgreSQL with pgvector for embedding-based similarity search (text-embedding-3-small, 1536 dimensions).

## Memory Layers

### 1. Episodic Memory
- Records events as they happen (what happened, who was involved, outcome)
- Auto-extracts entities and relationships into semantic layer
- Time-bounded, decaying relevance

### 2. Semantic Memory
- Facts and relationships (knowledge graph style)
- Entity types, relationships with confidence scores
- Never expires — grows over time

### 3. Procedural Memory
- Learned workflow patterns with success rates
- Steps, prerequisites, execution counts
- Higher success rate = higher priority in recommendations

### 4. Working Memory
- Active task context per agent session
- Session-scoped, replaces on new store
- Conversation history, active goals, task context

## Key Operations

### Write
- `storeEpisodic()` — stores event + auto-extracts to semantic
- `storeSemantic()` — stores facts/relationships
- `storeProcedural()` — stores workflow patterns
- `storeWorking()` — stores active session context

### Search (Req 4.2)
- Vector similarity search using pgvector `<=>` (cosine distance)
- Filters by tenant, layer, agent, date range
- Returns results sorted by similarity score

### Context Loading (Req 4.5)
- `loadAgentContext()` — loads working memory + recent episodic (7 days) + top procedural (5 patterns)
- Called at agent session start

### Cross-Agent Queries (Req 4.6)
- Agents can query other agents' memories within same tenant

### Conflict Detection (Req 4.7)
- Flags conflicting entries with metadata
- Retains both entries — never destructive

## Requirements Covered

4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7

## Location

`packages/services/src/zikaron/service.ts`

## Related

- [[Architecture Overview]]
- [[Data Models]]
- [[SME Intelligence System]]

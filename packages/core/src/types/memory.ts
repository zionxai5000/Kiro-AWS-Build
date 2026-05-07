/**
 * Zikaron memory data models — 4-layer persistent memory with vector search.
 */

import type { MemoryLayer } from './enums.js';

// ---------------------------------------------------------------------------
// Entity Reference (used by episodic entries)
// ---------------------------------------------------------------------------

export interface EntityReference {
  entityId: string;
  entityType: string;
  role: string;
}

// ---------------------------------------------------------------------------
// Relationship (used by semantic entries)
// ---------------------------------------------------------------------------

export interface Relationship {
  subjectId: string;
  predicate: string;
  objectId: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Procedure Step (used by procedural entries)
// ---------------------------------------------------------------------------

export interface ProcedureStep {
  order: number;
  action: string;
  description: string;
  expectedOutcome: string;
}

// ---------------------------------------------------------------------------
// Message (used by working memory)
// ---------------------------------------------------------------------------

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Base Memory Entry — all layers share this
// ---------------------------------------------------------------------------

export interface MemoryEntry {
  id: string;
  tenantId: string;
  layer: MemoryLayer;
  content: string;
  /** pgvector float array (1536 dimensions) */
  embedding: number[];
  sourceAgentId: string;
  tags: string[];
  createdAt: Date;
  expiresAt?: Date;
  conflictsWith?: string[];
}

// ---------------------------------------------------------------------------
// Episodic: event history
// ---------------------------------------------------------------------------

export interface EpisodicEntry extends MemoryEntry {
  layer: 'episodic';
  eventType: string;
  /** Agent IDs involved */
  participants: string[];
  outcome: 'success' | 'failure' | 'partial';
  relatedEntities: EntityReference[];
}

// ---------------------------------------------------------------------------
// Semantic: facts and relationships
// ---------------------------------------------------------------------------

export interface SemanticEntry extends MemoryEntry {
  layer: 'semantic';
  entityType: string;
  relationships: Relationship[];
  confidence: number;
  source: 'extracted' | 'manual' | 'inferred';
}

// ---------------------------------------------------------------------------
// Procedural: learned workflows
// ---------------------------------------------------------------------------

export interface ProceduralEntry extends MemoryEntry {
  layer: 'procedural';
  workflowPattern: string;
  successRate: number;
  executionCount: number;
  prerequisites: string[];
  steps: ProcedureStep[];
}

// ---------------------------------------------------------------------------
// Working: active task context
// ---------------------------------------------------------------------------

export interface WorkingMemoryContext extends MemoryEntry {
  layer: 'working';
  agentId: string;
  sessionId: string;
  taskContext: Record<string, unknown>;
  conversationHistory: Message[];
  activeGoals: string[];
}

// ---------------------------------------------------------------------------
// Memory Query
// ---------------------------------------------------------------------------

export interface MemoryQuery {
  text: string;
  layers?: MemoryLayer[];
  agentId?: string;
  tenantId: string;
  limit?: number;
  dateRange?: { start: Date; end: Date };
}

// ---------------------------------------------------------------------------
// Memory Result
// ---------------------------------------------------------------------------

export interface MemoryResult {
  id: string;
  layer: MemoryLayer;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  sourceAgentId: string;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Agent Memory Context (returned by loadAgentContext)
// ---------------------------------------------------------------------------

export interface AgentMemoryContext {
  agentId: string;
  workingMemory: WorkingMemoryContext | null;
  recentEpisodic: EpisodicEntry[];
  proceduralPatterns: ProceduralEntry[];
}

// ---------------------------------------------------------------------------
// Conflict Metadata
// ---------------------------------------------------------------------------

export interface ConflictMetadata {
  reason: string;
  detectedBy: string;
  detectedAt: Date;
}

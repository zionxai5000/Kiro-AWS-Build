/**
 * In-memory implementation of MemoryRepository with cosine similarity search.
 */

import { randomUUID } from 'node:crypto';
import type { MemoryLayer } from '../../types/enums.js';
import type {
  MemoryEntryRow,
  MemorySearchOptions,
  MemorySearchResult,
} from '../memory.repository.js';

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

export class InMemoryMemoryRepository {
  private readonly store = new Map<string, MemoryEntryRow>();

  async findById(_tenantId: string, id: string): Promise<MemoryEntryRow | null> {
    return this.store.get(id) ?? null;
  }

  async searchSimilar(
    _tenantId: string,
    options: MemorySearchOptions,
  ): Promise<MemorySearchResult[]> {
    const limit = options.limit ?? 10;
    const results: MemorySearchResult[] = [];

    for (const entry of this.store.values()) {
      if (!entry.embedding || entry.embedding.length === 0) continue;
      if (options.layers && options.layers.length > 0 && !options.layers.includes(entry.layer)) continue;
      if (options.agentId && entry.sourceAgentId !== options.agentId) continue;
      if (options.dateRange) {
        if (entry.createdAt < options.dateRange.start || entry.createdAt > options.dateRange.end) continue;
      }

      const similarity = cosineSimilarity(options.embedding, entry.embedding);
      results.push({ entry, similarity });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  async findByLayer(_tenantId: string, layer: MemoryLayer, limit = 100): Promise<MemoryEntryRow[]> {
    return Array.from(this.store.values())
      .filter((r) => r.layer === layer)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async findByAgent(_tenantId: string, agentId: string, limit = 100): Promise<MemoryEntryRow[]> {
    return Array.from(this.store.values())
      .filter((r) => r.sourceAgentId === agentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async findWorkingMemory(_tenantId: string, agentId: string): Promise<MemoryEntryRow | null> {
    const matches = Array.from(this.store.values())
      .filter((r) => r.layer === 'working' && r.sourceAgentId === agentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ?? null;
  }

  async findRecentEpisodic(_tenantId: string, since: Date, limit = 50): Promise<MemoryEntryRow[]> {
    return Array.from(this.store.values())
      .filter((r) => r.layer === 'episodic' && r.createdAt >= since)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async findTopProcedural(_tenantId: string, limit = 5): Promise<MemoryEntryRow[]> {
    return Array.from(this.store.values())
      .filter((r) => r.layer === 'procedural')
      .sort((a, b) => {
        const aRate = (a.metadata?.successRate as number) ?? 0;
        const bRate = (b.metadata?.successRate as number) ?? 0;
        return bRate - aRate;
      })
      .slice(0, limit);
  }

  async flagConflict(_tenantId: string, entryId: string, conflictsWithId: string): Promise<void> {
    const entry = this.store.get(entryId);
    if (!entry) return;
    const existing = entry.conflictsWith ?? [];
    entry.conflictsWith = [...existing, conflictsWithId];
  }

  async deleteExpired(_tenantId: string): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const [id, entry] of this.store) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.store.delete(id);
        count++;
      }
    }
    return count;
  }

  async createWithEmbedding(
    _tenantId: string,
    data: Omit<MemoryEntryRow, 'id' | 'createdAt'>,
  ): Promise<MemoryEntryRow> {
    const row: MemoryEntryRow = {
      id: randomUUID(),
      tenantId: data.tenantId,
      layer: data.layer,
      content: data.content,
      embedding: data.embedding,
      sourceAgentId: data.sourceAgentId,
      tags: data.tags,
      metadata: data.metadata,
      createdAt: new Date(),
      expiresAt: data.expiresAt,
      conflictsWith: data.conflictsWith,
    };
    this.store.set(row.id, row);
    return row;
  }

  async create(_tenantId: string, data: Partial<MemoryEntryRow>): Promise<MemoryEntryRow> {
    const row: MemoryEntryRow = {
      id: data.id ?? randomUUID(),
      tenantId: data.tenantId ?? _tenantId,
      layer: data.layer ?? 'episodic',
      content: data.content ?? '',
      embedding: data.embedding ?? null,
      sourceAgentId: data.sourceAgentId ?? null,
      tags: data.tags ?? [],
      metadata: data.metadata ?? {},
      createdAt: data.createdAt ?? new Date(),
      expiresAt: data.expiresAt ?? null,
      conflictsWith: data.conflictsWith ?? null,
    };
    this.store.set(row.id, row);
    return row;
  }

  async delete(_tenantId: string, id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

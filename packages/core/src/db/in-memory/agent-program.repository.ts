/**
 * In-memory implementation of AgentProgramRepository.
 * Stores data in Maps for local development without a database.
 */

import { randomUUID } from 'node:crypto';
import type { PaginationOptions, QueryResult } from '../repository.js';
import type { AgentProgramRow } from '../agent-program.repository.js';

export class InMemoryAgentProgramRepository {
  private readonly store = new Map<string, AgentProgramRow>();

  async findById(_tenantId: string, id: string): Promise<AgentProgramRow | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(
    _tenantId: string,
    pagination?: PaginationOptions,
  ): Promise<QueryResult<AgentProgramRow>> {
    const all = Array.from(this.store.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const limit = pagination?.limit ?? 100;
    const offset = pagination?.offset ?? 0;
    return { rows: all.slice(offset, offset + limit), total: all.length };
  }

  async findByNameAndVersion(
    _tenantId: string,
    name: string,
    version: string,
  ): Promise<AgentProgramRow | null> {
    for (const row of this.store.values()) {
      if (row.name === name && row.version === version) return row;
    }
    return null;
  }

  async findAllVersions(_tenantId: string, name: string): Promise<AgentProgramRow[]> {
    return Array.from(this.store.values())
      .filter((r) => r.name === name)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByPillar(
    _tenantId: string,
    pillar: string,
    pagination?: PaginationOptions,
  ): Promise<QueryResult<AgentProgramRow>> {
    const all = Array.from(this.store.values())
      .filter((r) => r.pillar === pillar)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const limit = pagination?.limit ?? 100;
    const offset = pagination?.offset ?? 0;
    return { rows: all.slice(offset, offset + limit), total: all.length };
  }

  async findByStatus(_tenantId: string, status: string): Promise<AgentProgramRow[]> {
    return Array.from(this.store.values())
      .filter((r) => r.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(_tenantId: string, data: Partial<AgentProgramRow>): Promise<AgentProgramRow> {
    const now = new Date();
    const row: AgentProgramRow = {
      id: data.id ?? randomUUID(),
      tenantId: _tenantId,
      name: data.name ?? '',
      version: data.version ?? '1.0.0',
      pillar: data.pillar ?? '',
      definition: data.definition ?? {},
      status: data.status ?? 'active',
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    this.store.set(row.id, row);
    return row;
  }

  async update(
    _tenantId: string,
    id: string,
    data: Partial<AgentProgramRow>,
  ): Promise<AgentProgramRow | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async updateStatus(
    _tenantId: string,
    id: string,
    status: string,
  ): Promise<AgentProgramRow | null> {
    return this.update(_tenantId, id, { status } as Partial<AgentProgramRow>);
  }

  async delete(_tenantId: string, id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

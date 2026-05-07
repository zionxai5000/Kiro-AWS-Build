/**
 * In-memory implementations of StateMachineDefinitionRepository and StateMachineInstanceRepository.
 */

import { randomUUID } from 'node:crypto';
import type { PaginationOptions, QueryResult } from '../repository.js';
import type {
  StateMachineDefinitionRow,
  StateMachineInstanceRow,
} from '../state-machine.repository.js';

export class InMemoryStateMachineDefinitionRepository {
  private readonly store = new Map<string, StateMachineDefinitionRow>();

  async findById(_tenantId: string, id: string): Promise<StateMachineDefinitionRow | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(
    _tenantId: string,
    pagination?: PaginationOptions,
  ): Promise<QueryResult<StateMachineDefinitionRow>> {
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
  ): Promise<StateMachineDefinitionRow | null> {
    for (const row of this.store.values()) {
      if (row.name === name && row.version === version) return row;
    }
    return null;
  }

  async findLatestByName(
    _tenantId: string,
    name: string,
  ): Promise<StateMachineDefinitionRow | null> {
    const matches = Array.from(this.store.values())
      .filter((r) => r.name === name)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ?? null;
  }

  async create(
    _tenantId: string,
    data: Partial<StateMachineDefinitionRow>,
  ): Promise<StateMachineDefinitionRow> {
    const row: StateMachineDefinitionRow = {
      id: data.id ?? randomUUID(),
      tenantId: _tenantId,
      name: data.name ?? '',
      version: data.version ?? '1.0.0',
      definition: data.definition ?? {},
      createdAt: data.createdAt ?? new Date(),
    };
    this.store.set(row.id, row);
    return row;
  }

  async update(
    _tenantId: string,
    id: string,
    data: Partial<StateMachineDefinitionRow>,
  ): Promise<StateMachineDefinitionRow | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    this.store.set(id, updated);
    return updated;
  }

  async delete(_tenantId: string, id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

export class InMemoryStateMachineInstanceRepository {
  private readonly store = new Map<string, StateMachineInstanceRow>();

  async findById(_tenantId: string, id: string): Promise<StateMachineInstanceRow | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(
    _tenantId: string,
    pagination?: PaginationOptions,
  ): Promise<QueryResult<StateMachineInstanceRow>> {
    const all = Array.from(this.store.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const limit = pagination?.limit ?? 100;
    const offset = pagination?.offset ?? 0;
    return { rows: all.slice(offset, offset + limit), total: all.length };
  }

  async findByEntityId(
    _tenantId: string,
    entityId: string,
  ): Promise<StateMachineInstanceRow | null> {
    for (const row of this.store.values()) {
      if (row.entityId === entityId) return row;
    }
    return null;
  }

  async findByDefinitionId(
    _tenantId: string,
    definitionId: string,
    pagination?: PaginationOptions,
  ): Promise<QueryResult<StateMachineInstanceRow>> {
    const all = Array.from(this.store.values())
      .filter((r) => r.definitionId === definitionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const limit = pagination?.limit ?? 100;
    const offset = pagination?.offset ?? 0;
    return { rows: all.slice(offset, offset + limit), total: all.length };
  }

  async findByState(
    _tenantId: string,
    currentState: string,
  ): Promise<StateMachineInstanceRow[]> {
    return Array.from(this.store.values())
      .filter((r) => r.currentState === currentState)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async create(
    _tenantId: string,
    data: Partial<StateMachineInstanceRow>,
  ): Promise<StateMachineInstanceRow> {
    const now = new Date();
    const row: StateMachineInstanceRow = {
      id: data.id ?? randomUUID(),
      definitionId: data.definitionId ?? '',
      entityId: data.entityId ?? '',
      tenantId: _tenantId,
      currentState: data.currentState ?? '',
      data: data.data ?? {},
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    this.store.set(row.id, row);
    return row;
  }

  async updateState(
    _tenantId: string,
    id: string,
    currentState: string,
    data: Record<string, unknown>,
  ): Promise<StateMachineInstanceRow | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated = { ...existing, currentState, data, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async update(
    _tenantId: string,
    id: string,
    data: Partial<StateMachineInstanceRow>,
  ): Promise<StateMachineInstanceRow | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async delete(_tenantId: string, id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

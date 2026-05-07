/**
 * In-memory implementation of TenantRepository.
 */

import { randomUUID } from 'node:crypto';
import type { TenantRow } from '../tenant.repository.js';

export class InMemoryTenantRepository {
  private readonly store = new Map<string, TenantRow>();

  async findById(_tenantId: string, id: string): Promise<TenantRow | null> {
    return this.store.get(id) ?? null;
  }

  async findByName(_tenantId: string, name: string): Promise<TenantRow | null> {
    for (const row of this.store.values()) {
      if (row.name === name) return row;
    }
    return null;
  }

  async findChildren(_tenantId: string): Promise<TenantRow[]> {
    return Array.from(this.store.values()).filter(
      (r) => r.parentTenantId === _tenantId,
    );
  }

  async create(_tenantId: string, data: Partial<TenantRow>): Promise<TenantRow> {
    const row: TenantRow = {
      id: data.id ?? randomUUID(),
      name: data.name ?? '',
      type: data.type ?? 'platform_user',
      parentTenantId: data.parentTenantId ?? null,
      config: data.config ?? {},
      status: data.status ?? 'active',
      createdAt: data.createdAt ?? new Date(),
    };
    this.store.set(row.id, row);
    return row;
  }

  async delete(_tenantId: string, id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

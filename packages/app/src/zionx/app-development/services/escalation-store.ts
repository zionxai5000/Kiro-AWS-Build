/**
 * Escalation Store — persistence layer for hook escalations.
 *
 * Aurora schema (created via packages/infra schema-migrations):
 *   CREATE TABLE app_dev_escalations (
 *     id UUID PRIMARY KEY,
 *     project_id TEXT NOT NULL,
 *     hook_id TEXT NOT NULL,
 *     reason TEXT NOT NULL,
 *     failure_context JSONB NOT NULL,
 *     self_heal_attempts INTEGER NOT NULL DEFAULT 0,
 *     status TEXT NOT NULL CHECK (status IN ('open','self_healing','resolved','operator_required')),
 *     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     resolved_at TIMESTAMPTZ,
 *     resolution TEXT,
 *     notes TEXT
 *   );
 *
 * For the MVP we keep an in-memory mirror of the table — every write is
 * forwarded to Aurora when a `db` adapter is supplied, but the in-memory
 * copy is always queryable for the dashboard `/escalations` endpoint even if
 * the DB is unreachable. This guarantees operators can always see what's
 * happening.
 */

import { randomUUID } from 'node:crypto';

export type EscalationStatus = 'open' | 'self_healing' | 'resolved' | 'operator_required';

export interface EscalationRecord {
  id: string;
  projectId: string;
  hookId: string;
  reason: string;
  failureContext: Record<string, unknown>;
  selfHealAttempts: number;
  status: EscalationStatus;
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
  notes?: string;
}

export interface EscalationDbAdapter {
  insert: (record: EscalationRecord) => Promise<void>;
  update: (id: string, patch: Partial<EscalationRecord>) => Promise<void>;
  list: (filter: { status?: EscalationStatus }) => Promise<EscalationRecord[]>;
}

const memoryStore = new Map<string, EscalationRecord>();
let dbAdapter: EscalationDbAdapter | null = null;

export function setEscalationDbAdapter(adapter: EscalationDbAdapter | null): void {
  dbAdapter = adapter;
}

export async function createEscalation(input: {
  projectId: string;
  hookId: string;
  reason: string;
  failureContext: Record<string, unknown>;
}): Promise<EscalationRecord> {
  const record: EscalationRecord = {
    id: randomUUID(),
    projectId: input.projectId,
    hookId: input.hookId,
    reason: input.reason,
    failureContext: input.failureContext,
    selfHealAttempts: 0,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  memoryStore.set(record.id, record);
  if (dbAdapter) {
    try {
      await dbAdapter.insert(record);
    } catch (err) {
      // Don't bubble — operators can still see it via memory store.
      console.warn('[escalation-store] DB insert failed:', (err as Error).message);
    }
  }
  return record;
}

export async function updateEscalation(
  id: string,
  patch: Partial<EscalationRecord>,
): Promise<EscalationRecord | null> {
  const existing = memoryStore.get(id);
  if (!existing) return null;
  const merged: EscalationRecord = { ...existing, ...patch };
  memoryStore.set(id, merged);
  if (dbAdapter) {
    try {
      await dbAdapter.update(id, patch);
    } catch (err) {
      console.warn('[escalation-store] DB update failed:', (err as Error).message);
    }
  }
  return merged;
}

export async function listEscalations(filter?: { status?: EscalationStatus }): Promise<EscalationRecord[]> {
  if (dbAdapter) {
    try {
      return await dbAdapter.list(filter ?? {});
    } catch (err) {
      console.warn('[escalation-store] DB list failed, falling back to memory:', (err as Error).message);
    }
  }
  const all = Array.from(memoryStore.values());
  return filter?.status ? all.filter((e) => e.status === filter.status) : all;
}

/** Reset the store — for tests. */
export function resetEscalations(): void {
  memoryStore.clear();
}

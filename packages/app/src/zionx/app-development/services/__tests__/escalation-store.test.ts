import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEscalation,
  updateEscalation,
  listEscalations,
  resetEscalations,
} from '../escalation-store.js';

describe('escalation-store', () => {
  beforeEach(() => resetEscalations());

  it('creates an escalation with status=open', async () => {
    const rec = await createEscalation({
      projectId: 'proj-1',
      hookId: 'build-runner',
      reason: 'watchdog-timeout',
      failureContext: { timeoutMs: 30000 },
    });
    expect(rec.status).toBe('open');
    expect(rec.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('updates an escalation by id', async () => {
    const rec = await createEscalation({
      projectId: 'p',
      hookId: 'h',
      reason: 'r',
      failureContext: {},
    });
    const updated = await updateEscalation(rec.id, { status: 'resolved', notes: 'done' });
    expect(updated?.status).toBe('resolved');
    expect(updated?.notes).toBe('done');
  });

  it('list filters by status', async () => {
    await createEscalation({ projectId: 'p', hookId: 'h1', reason: 'r', failureContext: {} });
    const second = await createEscalation({ projectId: 'p', hookId: 'h2', reason: 'r', failureContext: {} });
    await updateEscalation(second.id, { status: 'resolved' });

    const open = await listEscalations({ status: 'open' });
    const resolved = await listEscalations({ status: 'resolved' });
    expect(open).toHaveLength(1);
    expect(resolved).toHaveLength(1);
  });
});

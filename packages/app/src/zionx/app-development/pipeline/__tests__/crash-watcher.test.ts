import { describe, it, expect, vi } from 'vitest';
import { run, HOOK_METADATA, verifySentrySignature } from '../10-crash-watcher.js';
import type { EventBusService } from '@seraphim/core';

function ctx() {
  return {
    executionId: 'exec-1',
    dryRun: false,
    startedAt: new Date().toISOString(),
    log: () => {},
  };
}

function makeEventBus(): EventBusService {
  return {
    async publish() { return 'id'; },
    async publishBatch() { return []; },
    async subscribe() { return 'sub'; },
    async unsubscribe() {},
    async getDeadLetterMessages() { return []; },
    async retryDeadLetter() {},
  } as unknown as EventBusService;
}

describe('Hook 10: crash-watcher', () => {
  it('exports metadata', () => {
    expect(HOOK_METADATA.id).toBe('crash-watcher');
    expect(HOOK_METADATA.triggerType).toBe('webhook');
  });

  it('publishes a CRASH_OBSERVED event for a typical Sentry payload', async () => {
    const eventBus = makeEventBus();
    const publishSpy = vi.spyOn(eventBus, 'publish');

    const result = await run(
      {
        projectId: 'proj-mindful',
        payload: {
          action: 'created',
          data: {
            issue: {
              id: '12345',
              title: 'TypeError: undefined is not an object',
              project: { slug: 'mindful-timer' },
              permalink: 'https://sentry.io/organizations/zionxai/issues/12345/',
            },
            event: {
              event_id: 'evt-abc',
              message: 'TypeError: undefined is not an object',
              platform: 'cocoa',
              tags: [
                ['app.version', '1.0.0'],
                ['app.build', '24'],
              ],
            },
          },
        },
        eventBus,
        tenantId: 'tenant-1',
      },
      ctx(),
    );

    expect(result.success).toBe(true);
    expect(result.data?.observed).toBe(true);
    expect(result.data?.platform).toBe('ios');
    expect(publishSpy).toHaveBeenCalled();
  });
});

describe('verifySentrySignature', () => {
  it('returns true for matching HMAC', () => {
    const secret = 'sentry-secret';
    const body = '{"hello":"world"}';
    // pre-computed sha256
    const sig = 'sha256=' + require('node:crypto').createHmac('sha256', secret).update(body).digest('hex');
    expect(verifySentrySignature(body, sig, secret)).toBe(true);
  });

  it('returns false for mismatched HMAC', () => {
    expect(verifySentrySignature('body', 'sha256=deadbeef', 'secret')).toBe(false);
  });

  it('returns false for missing signature', () => {
    expect(verifySentrySignature('body', null, 'secret')).toBe(false);
  });
});

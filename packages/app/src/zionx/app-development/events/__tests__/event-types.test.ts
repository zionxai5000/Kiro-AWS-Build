import { describe, it, expect } from 'vitest';
import {
  APPDEV_EVENT_SOURCE,
  APPDEV_EVENTS,
  createAppDevEvent,
} from '../event-types.js';

describe('APPDEV_EVENTS constants', () => {
  it('has all 6 event types defined', () => {
    expect(Object.keys(APPDEV_EVENTS)).toHaveLength(6);
  });

  it('all event types start with "appdev."', () => {
    for (const type of Object.values(APPDEV_EVENTS)) {
      expect(type).toMatch(/^appdev\./);
    }
  });

  it('uses noun.verb hierarchy', () => {
    expect(APPDEV_EVENTS.PROJECT_CREATED).toBe('appdev.project.created');
    expect(APPDEV_EVENTS.PROJECT_UPDATED).toBe('appdev.project.updated');
    expect(APPDEV_EVENTS.HOOK_STARTED).toBe('appdev.hook.started');
    expect(APPDEV_EVENTS.HOOK_COMPLETED).toBe('appdev.hook.completed');
    expect(APPDEV_EVENTS.WORKSPACE_FILE_CHANGED).toBe('appdev.workspace.file.changed');
    expect(APPDEV_EVENTS.BUILD_STATUS_CHANGED).toBe('appdev.build.status.changed');
  });
});

describe('APPDEV_EVENT_SOURCE', () => {
  it('is seraphim.app-development', () => {
    expect(APPDEV_EVENT_SOURCE).toBe('seraphim.app-development');
  });
});

describe('createAppDevEvent', () => {
  it('creates a valid SystemEvent', () => {
    const event = createAppDevEvent(
      APPDEV_EVENTS.PROJECT_CREATED,
      { projectId: 'proj-1', name: 'Test App', platform: 'ios' },
      'tenant-1',
    );

    expect(event.source).toBe('seraphim.app-development');
    expect(event.type).toBe('appdev.project.created');
    expect(event.detail).toEqual({ projectId: 'proj-1', name: 'Test App', platform: 'ios' });
    expect(event.metadata.tenantId).toBe('tenant-1');
    expect(event.metadata.correlationId).toBeDefined();
    expect(event.metadata.timestamp).toBeInstanceOf(Date);
  });

  it('uses provided correlationId', () => {
    const event = createAppDevEvent(
      APPDEV_EVENTS.HOOK_STARTED,
      { projectId: 'proj-1', hookId: 'code-generator', executionId: 'exec-1', dryRun: true },
      'tenant-1',
      'corr-123',
    );

    expect(event.metadata.correlationId).toBe('corr-123');
  });

  it('generates correlationId when not provided', () => {
    const event1 = createAppDevEvent(APPDEV_EVENTS.PROJECT_CREATED, {}, 'tenant-1');
    const event2 = createAppDevEvent(APPDEV_EVENTS.PROJECT_CREATED, {}, 'tenant-1');
    expect(event1.metadata.correlationId).not.toBe(event2.metadata.correlationId);
  });
});

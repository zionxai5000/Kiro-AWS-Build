/**
 * Unit tests for Notification Delivery System
 * Validates: Requirements 9.3, 9.5, 19.2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationService } from '../notifications.js';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
  });

  it('should send notification to user', async () => {
    service.setPreferences({
      userId: 'king-1',
      tenantId: 'tenant-1',
      preferredChannel: 'dashboard',
      priorityFilter: 'low',
    });

    const result = await service.send('king-1', 'Alert', 'Test alert', 'high');
    expect(result.status).toBe('sent');
    expect(result.channel).toBe('dashboard');
    expect(result.latencyMs).toBeLessThan(60000); // Within 60s SLA
  });

  it('should route to preferred channel', async () => {
    service.setPreferences({
      userId: 'king-1',
      tenantId: 'tenant-1',
      preferredChannel: 'telegram',
      priorityFilter: 'low',
    });

    const result = await service.send('king-1', 'Alert', 'Test', 'medium');
    expect(result.channel).toBe('telegram');
  });

  it('should scope Queen notifications to authorized pillars', async () => {
    service.setPreferences({
      userId: 'queen-1',
      tenantId: 'tenant-1',
      preferredChannel: 'email',
      priorityFilter: 'low',
      authorizedPillars: ['eretz'],
    });

    const allowed = await service.send('queen-1', 'Alert', 'Eretz alert', 'high', 'eretz');
    expect(allowed.status).toBe('sent');

    const blocked = await service.send('queen-1', 'Alert', 'Otzar alert', 'high', 'otzar');
    expect(blocked.status).toBe('failed');
    expect(blocked.error).toContain('not authorized');
  });

  it('should filter by priority threshold', async () => {
    service.setPreferences({
      userId: 'king-1',
      tenantId: 'tenant-1',
      preferredChannel: 'dashboard',
      priorityFilter: 'high',
    });

    const high = await service.send('king-1', 'Alert', 'High priority', 'high');
    expect(high.status).toBe('sent');

    const low = await service.send('king-1', 'Alert', 'Low priority', 'low');
    expect(low.status).toBe('failed');
    expect(low.error).toContain('priority');
  });

  it('should default to dashboard when no preferences set', async () => {
    const result = await service.send('unknown-user', 'Alert', 'Test', 'high');
    expect(result.channel).toBe('dashboard');
  });
});

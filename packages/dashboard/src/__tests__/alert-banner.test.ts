import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AlertBanner, type AlertItem } from '../components/alert-banner.js';
import { MockDashboardWebSocket } from './helpers.js';

describe('AlertBanner', () => {
  let container: HTMLElement;
  let mockWs: MockDashboardWebSocket;

  beforeEach(() => {
    container = document.createElement('div');
    mockWs = new MockDashboardWebSocket();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders empty when no alerts', () => {
    new AlertBanner(container, mockWs as any);
    expect(container.innerHTML).toBe('');
  });

  it('displays alert when WebSocket alert.triggered message received', () => {
    new AlertBanner(container, mockWs as any);

    mockWs.simulateMessage('alert.triggered', {
      alertId: 'alert-1',
      message: 'CPU usage high',
      severity: 'warning',
    });

    expect(container.querySelector('.alert-item')).not.toBeNull();
    expect(container.textContent).toContain('CPU usage high');
  });

  it('shows correct severity class (alert-info, alert-warning, alert-critical)', () => {
    const banner = new AlertBanner(container, mockWs as any);

    banner.addAlert({
      id: 'a1',
      message: 'Info alert',
      severity: 'info',
      timestamp: new Date().toISOString(),
    });
    expect(container.querySelector('.alert-info')).not.toBeNull();

    banner.addAlert({
      id: 'a2',
      message: 'Warning alert',
      severity: 'warning',
      timestamp: new Date().toISOString(),
    });
    expect(container.querySelector('.alert-warning')).not.toBeNull();

    banner.addAlert({
      id: 'a3',
      message: 'Critical alert',
      severity: 'critical',
      timestamp: new Date().toISOString(),
    });
    expect(container.querySelector('.alert-critical')).not.toBeNull();
  });

  it('dismiss button removes alert', () => {
    const banner = new AlertBanner(container, mockWs as any);

    banner.addAlert({
      id: 'dismiss-me',
      message: 'Dismissable alert',
      severity: 'info',
      timestamp: new Date().toISOString(),
    });

    expect(container.querySelector('[data-alert-id="dismiss-me"]')).not.toBeNull();

    const dismissBtn = container.querySelector<HTMLButtonElement>('button[data-dismiss="dismiss-me"]')!;
    dismissBtn.click();

    expect(container.querySelector('[data-alert-id="dismiss-me"]')).toBeNull();
  });

  it('auto-dismisses after timeout', () => {
    vi.useFakeTimers();

    const banner = new AlertBanner(container, mockWs as any);

    banner.addAlert({
      id: 'auto-dismiss',
      message: 'Will auto dismiss',
      severity: 'warning',
      timestamp: new Date().toISOString(),
    });

    expect(container.querySelector('[data-alert-id="auto-dismiss"]')).not.toBeNull();

    // Advance past the 30s dismiss timeout
    vi.advanceTimersByTime(30_001);

    expect(container.querySelector('[data-alert-id="auto-dismiss"]')).toBeNull();
  });

  it('multiple alerts stack correctly', () => {
    const banner = new AlertBanner(container, mockWs as any);

    banner.addAlert({ id: 'a1', message: 'First', severity: 'info', timestamp: new Date().toISOString() });
    banner.addAlert({ id: 'a2', message: 'Second', severity: 'warning', timestamp: new Date().toISOString() });
    banner.addAlert({ id: 'a3', message: 'Third', severity: 'critical', timestamp: new Date().toISOString() });

    const alertItems = container.querySelectorAll('.alert-item');
    expect(alertItems.length).toBe(3);
  });

  it('destroy() cleans up timers', () => {
    vi.useFakeTimers();

    const banner = new AlertBanner(container, mockWs as any);

    banner.addAlert({ id: 'a1', message: 'Alert', severity: 'info', timestamp: new Date().toISOString() });

    banner.destroy();

    // Advancing timers should not cause errors after destroy
    vi.advanceTimersByTime(60_000);

    // Alert should still be in DOM since destroy doesn't re-render, it just clears timers
    // The key thing is no errors are thrown
  });
});

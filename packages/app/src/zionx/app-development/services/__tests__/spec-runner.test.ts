/**
 * Spec Runner unit tests.
 *
 * We feed synthetic Sentry breadcrumb sequences into evaluate() and assert
 * the right rules trigger as violations or matches. The Sentry network
 * fetch path is not exercised here (it requires real auth tokens).
 */

import { describe, it, expect } from 'vitest';
import { evaluate, type SentryBreadcrumb } from '../spec-runner.js';

function bc(
  tsSeconds: number,
  message: string,
  data?: Record<string, unknown>,
): SentryBreadcrumb {
  return {
    timestamp: tsSeconds,
    category: 'user',
    type: 'user',
    level: 'info',
    message,
    data,
  };
}

describe('Spec Runner — evaluate()', () => {
  it('reports a violation when send is not followed by a project create or stream', () => {
    const breadcrumbs = [
      bc(100, 'studio.send'),
      // ten seconds of silence (well past the 5s window)
      bc(200, 'studio.openFile'),
    ];
    const report = evaluate(breadcrumbs);
    expect(report.violations.length).toBeGreaterThanOrEqual(1);
    expect(report.violations.some((v) => v.ruleId === 'send-creates-or-streams')).toBe(true);
  });

  it('records a match when send → streamGenerateCode happens within 5s', () => {
    const breadcrumbs = [
      bc(100, 'studio.send'),
      bc(102, 'studio.streamGenerateCode'),
      bc(150, 'studio.streamStart'),
      bc(160, 'studio.streamDone'),
    ];
    const report = evaluate(breadcrumbs);
    expect(report.matched.some((m) => m.ruleId === 'send-creates-or-streams')).toBe(true);
    expect(report.matched.some((m) => m.ruleId === 'stream-must-resolve')).toBe(true);
  });

  it('records a violation when streamStart never resolves', () => {
    const breadcrumbs = [
      bc(100, 'studio.send'),
      bc(101, 'studio.streamStart'),
      // No done/error — and no later breadcrumbs
    ];
    const report = evaluate(breadcrumbs);
    expect(report.violations.some((v) => v.ruleId === 'stream-must-resolve')).toBe(true);
  });

  it('warns (not violates) when streamDone is not followed by a preview', () => {
    const breadcrumbs = [
      bc(100, 'studio.streamDone'),
      // No buildPreview within 60s
    ];
    const report = evaluate(breadcrumbs);
    expect(report.warnings.some((w) => w.ruleId === 'done-triggers-preview')).toBe(true);
    expect(report.violations.some((v) => v.ruleId === 'done-triggers-preview')).toBe(false);
  });

  it('counts summary metrics correctly', () => {
    const breadcrumbs = [
      bc(100, 'studio.send'),
      bc(101, 'studio.streamStart'),
      bc(110, 'studio.streamDone'),
      bc(120, 'studio.previewReady'),
      bc(150, 'studio.send'),
      bc(151, 'studio.streamStart'),
      bc(160, 'studio.streamError'),
      bc(200, 'studio.build'),
      bc(201, 'studio.buildQueued'),
      bc(300, 'studio.deploy'),
      bc(301, 'studio.deployStarted'),
    ];
    const report = evaluate(breadcrumbs);
    expect(report.summary.promptsSent).toBe(2);
    expect(report.summary.successfulGenerations).toBe(1);
    expect(report.summary.failedGenerations).toBe(1);
    expect(report.summary.successfulPreviews).toBe(1);
    expect(report.summary.builds).toBe(1);
    expect(report.summary.deploys).toBe(1);
  });

  it('handles the empty timeline without throwing', () => {
    const report = evaluate([]);
    expect(report.violations).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.matched).toEqual([]);
    expect(report.summary.promptsSent).toBe(0);
  });

  it('matches build-clicks-must-respond when the buildQueued breadcrumb arrives in time', () => {
    const breadcrumbs = [
      bc(100, 'studio.build'),
      bc(101, 'studio.buildQueued'),
    ];
    const report = evaluate(breadcrumbs);
    expect(report.matched.some((m) => m.ruleId === 'build-clicks-must-respond')).toBe(true);
  });

  it('violates save-file-must-respond when save has no follow-up', () => {
    const breadcrumbs = [
      bc(100, 'studio.saveFile'),
      // nothing follows
    ];
    const report = evaluate(breadcrumbs);
    expect(report.violations.some((v) => v.ruleId === 'save-file-must-respond')).toBe(true);
  });
});

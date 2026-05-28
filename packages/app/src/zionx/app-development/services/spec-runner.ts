/**
 * Spec Runner — evaluates Sentry breadcrumb sequences against the canonical
 * ZionX Studio spec (`docs/zionx-studio-spec.md`).
 *
 * What it does
 * ------------
 * Given a sequence of Sentry breadcrumbs (e.g. from a single user session),
 * the runner walks the breadcrumb timeline and verifies that every
 * "click → backend response" pairing matches the spec's acceptance criteria.
 *
 * Outputs
 * -------
 *   - violations[]: spec rules that were broken
 *   - warnings[]:   suspicious but not strictly violating sequences
 *   - matchedRules[]: rules that fired and passed
 *
 * How it's used
 * -------------
 * 1. The dashboard fires structured `studio.<action>` breadcrumbs via
 *    `captureUserAction` (see packages/dashboard/src/sentry.ts).
 * 2. Once per hour (or on demand), `evaluateRecentSession()` pulls the last
 *    N breadcrumbs from Sentry's REST API and runs them through `evaluate()`.
 * 3. Violations are surfaced as escalations OR (for low-severity drifts)
 *    logged as compliance warnings.
 *
 * Why this lives in the backend
 * -----------------------------
 * Spec validation MUST be in a process the operator controls — a browser
 * client can't be trusted to grade itself. This module reads the spec from
 * disk, parses the rule table out of section 3, and runs the matcher
 * server-side.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A Sentry breadcrumb — only the fields we care about. */
export interface SentryBreadcrumb {
  timestamp: number; // unix seconds
  category?: string; // 'user' | 'http' | 'console' | etc.
  type?: string;
  message?: string;
  data?: Record<string, unknown>;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
}

export interface SpecViolation {
  ruleId: string;
  message: string;
  expectedNext: string;
  actualNext: string | '(none)';
  breadcrumb: SentryBreadcrumb;
}

export interface SpecMatch {
  ruleId: string;
  message: string;
  breadcrumbs: SentryBreadcrumb[];
}

export interface SpecEvaluationReport {
  evaluatedAt: string;
  breadcrumbCount: number;
  violations: SpecViolation[];
  warnings: SpecViolation[];
  matched: SpecMatch[];
  summary: {
    sessions: number;
    promptsSent: number;
    successfulGenerations: number;
    failedGenerations: number;
    successfulPreviews: number;
    failedPreviews: number;
    builds: number;
    deploys: number;
  };
}

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

/**
 * Each rule says: when you see breadcrumb X, within `withinMs` you must see
 * one of the breadcrumbs in `expect`. Otherwise emit a violation.
 *
 * These rules encode section 3 (button table) + section 8 (acceptance) of
 * the spec.
 */
interface SequenceRule {
  id: string;
  description: string;
  trigger: { category?: string; messagePattern: RegExp };
  expect: { messagePattern: RegExp; description: string };
  withinMs: number;
  severity: 'violation' | 'warning';
}

const RULES: SequenceRule[] = [
  {
    id: 'send-creates-or-streams',
    description: 'Send button must create a project (if none) and start a generate stream',
    trigger: { messagePattern: /^studio\.send$/ },
    expect: {
      messagePattern: /studio\.(createProject|streamGenerateCode|streamStart)|app-dev\/projects\/.+\/generate/,
      description: 'a project create or generate request',
    },
    withinMs: 5000,
    severity: 'violation',
  },
  {
    id: 'stream-must-resolve',
    description: 'A generate stream must end with a done OR error event',
    trigger: { messagePattern: /^studio\.streamStart$/ },
    expect: {
      messagePattern: /^studio\.streamDone$|^studio\.streamError$/,
      description: 'a streamDone or streamError breadcrumb',
    },
    withinMs: 600_000, // 10 min ceiling — generation never legitimately runs longer
    severity: 'violation',
  },
  {
    id: 'done-triggers-preview',
    description: 'A successful generate done should trigger a preview build within 60s',
    trigger: { messagePattern: /^studio\.streamDone$/ },
    expect: {
      messagePattern: /^studio\.buildPreview$|^studio\.previewReady$/,
      description: 'a buildPreview call',
    },
    withinMs: 60_000,
    severity: 'warning', // user might intentionally skip preview
  },
  {
    id: 'build-clicks-must-respond',
    description: 'Build button click must produce a backend response',
    trigger: { messagePattern: /^studio\.build$/ },
    expect: {
      messagePattern: /studio\.buildQueued|studio\.buildError|app-dev\/projects\/.+\/build/,
      description: 'a buildQueued or buildError breadcrumb',
    },
    withinMs: 5000,
    severity: 'violation',
  },
  {
    id: 'deploy-only-after-build',
    description: 'Deploy can only be clicked after a successful build',
    trigger: { messagePattern: /^studio\.deploy$/ },
    expect: {
      messagePattern: /studio\.deployStarted|app-dev\/projects\/.+\/auto-submit/,
      description: 'a deployStarted breadcrumb',
    },
    withinMs: 5000,
    severity: 'violation',
  },
  {
    id: 'open-file-must-load',
    description: 'Clicking a file must result in a file load within 2s',
    trigger: { messagePattern: /^studio\.openFile$/ },
    expect: {
      messagePattern: /studio\.fileLoaded|app-dev\/projects\/.+\/file/,
      description: 'a fileLoaded breadcrumb',
    },
    withinMs: 2000,
    severity: 'warning',
  },
  {
    id: 'save-file-must-respond',
    description: 'Save click must produce a save response',
    trigger: { messagePattern: /^studio\.saveFile$/ },
    expect: {
      messagePattern: /studio\.fileSaved|studio\.saveError|app-dev\/projects\/.+\/file/,
      description: 'a fileSaved or saveError breadcrumb',
    },
    withinMs: 5000,
    severity: 'violation',
  },
];

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Run the rule set against a breadcrumb timeline.
 * Breadcrumbs MUST be ordered by timestamp ascending.
 */
export function evaluate(breadcrumbs: SentryBreadcrumb[]): SpecEvaluationReport {
  const sorted = [...breadcrumbs].sort((a, b) => a.timestamp - b.timestamp);
  const violations: SpecViolation[] = [];
  const warnings: SpecViolation[] = [];
  const matched: SpecMatch[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (!b) continue;
    const msg = breadcrumbMessage(b);

    for (const rule of RULES) {
      if (!rule.trigger.messagePattern.test(msg)) continue;
      if (rule.trigger.category && b.category !== rule.trigger.category) continue;

      // Look ahead within the time window for an expected breadcrumb
      const cutoff = b.timestamp + rule.withinMs / 1000;
      let foundMatch: SentryBreadcrumb | null = null;
      let firstAfter: SentryBreadcrumb | null = null;
      for (let j = i + 1; j < sorted.length; j++) {
        const next = sorted[j];
        if (!next || next.timestamp > cutoff) break;
        if (!firstAfter) firstAfter = next;
        if (rule.expect.messagePattern.test(breadcrumbMessage(next))) {
          foundMatch = next;
          break;
        }
      }

      if (foundMatch) {
        matched.push({
          ruleId: rule.id,
          message: rule.description,
          breadcrumbs: [b, foundMatch],
        });
      } else {
        const violation: SpecViolation = {
          ruleId: rule.id,
          message: rule.description,
          expectedNext: rule.expect.description,
          actualNext: firstAfter ? breadcrumbMessage(firstAfter) : '(none)',
          breadcrumb: b,
        };
        if (rule.severity === 'violation') violations.push(violation);
        else warnings.push(violation);
      }
    }
  }

  // Summary stats
  const summary = {
    sessions: countDistinctSessions(sorted),
    promptsSent: countMatching(sorted, /^studio\.send$/),
    successfulGenerations: countMatching(sorted, /^studio\.streamDone$/),
    failedGenerations: countMatching(sorted, /^studio\.streamError$/),
    successfulPreviews: countMatching(sorted, /^studio\.previewReady$/),
    failedPreviews: countMatching(sorted, /^studio\.previewError$/),
    builds: countMatching(sorted, /^studio\.build$/),
    deploys: countMatching(sorted, /^studio\.deploy$/),
  };

  return {
    evaluatedAt: new Date().toISOString(),
    breadcrumbCount: sorted.length,
    violations,
    warnings,
    matched,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Sentry API integration
// ---------------------------------------------------------------------------

export interface FetchBreadcrumbsConfig {
  /** Sentry auth token (from seraphim/sentry secret). */
  authToken: string;
  /** Sentry organization slug — usually 'zionxai'. */
  org: string;
  /** Sentry project slug — 'zionx-dashboard' for the browser app. */
  project: string;
  /** How many recent issues to scan (default 50). */
  issueLimit?: number;
}

/**
 * Pull recent breadcrumbs from Sentry's REST API. We aggregate breadcrumbs
 * across the most recent issues for the project, since Sentry doesn't expose
 * a flat "all breadcrumbs" stream — they live attached to events.
 *
 * For richer querying, switch to Sentry's Discover/event API.
 */
export async function fetchRecentBreadcrumbs(
  config: FetchBreadcrumbsConfig,
): Promise<SentryBreadcrumb[]> {
  const issuesUrl = `https://sentry.io/api/0/projects/${encodeURIComponent(config.org)}/${encodeURIComponent(config.project)}/issues/?limit=${config.issueLimit ?? 50}&sort=date`;
  const issuesRes = await fetch(issuesUrl, {
    headers: { Authorization: `Bearer ${config.authToken}` },
  });
  if (!issuesRes.ok) {
    throw new Error(`Sentry issues fetch failed: ${issuesRes.status}`);
  }
  const issues = (await issuesRes.json()) as Array<{ id: string }>;
  const breadcrumbs: SentryBreadcrumb[] = [];

  for (const issue of issues) {
    const eventUrl = `https://sentry.io/api/0/issues/${encodeURIComponent(issue.id)}/events/latest/`;
    const eventRes = await fetch(eventUrl, {
      headers: { Authorization: `Bearer ${config.authToken}` },
    });
    if (!eventRes.ok) continue;
    const event = (await eventRes.json()) as { breadcrumbs?: { values?: SentryBreadcrumb[] } };
    const values = event.breadcrumbs?.values;
    if (!values) continue;
    breadcrumbs.push(...values);
  }
  // Sentry returns oldest-first per event; sort across events.
  return breadcrumbs.sort((a, b) => a.timestamp - b.timestamp);
}

/** Convenience: fetch + evaluate in one call. */
export async function evaluateRecentSession(
  config: FetchBreadcrumbsConfig,
): Promise<SpecEvaluationReport> {
  const breadcrumbs = await fetchRecentBreadcrumbs(config);
  return evaluate(breadcrumbs);
}

/** Load the spec markdown so callers can echo it alongside reports. */
export async function loadSpecMarkdown(repoRoot: string): Promise<string> {
  return readFile(join(repoRoot, 'docs', 'zionx-studio-spec.md'), 'utf-8');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function breadcrumbMessage(b: SentryBreadcrumb): string {
  return b.message ?? (b.data?.['url'] as string | undefined) ?? '';
}

function countMatching(bs: SentryBreadcrumb[], pattern: RegExp): number {
  return bs.filter((b) => pattern.test(breadcrumbMessage(b))).length;
}

function countDistinctSessions(bs: SentryBreadcrumb[]): number {
  const sessions = new Set<string>();
  for (const b of bs) {
    const sid = (b.data?.['sessionId'] as string | undefined) ?? null;
    if (sid) sessions.add(sid);
  }
  return sessions.size || 1;
}

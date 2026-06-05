#!/usr/bin/env node
/**
 * Eval suite CLI — `pnpm test:evals`.
 *
 *   pnpm test:evals                       # run every task, no baseline check
 *   pnpm test:evals --only build-habit-tracker,fix-broken-import
 *   pnpm test:evals --baseline-check      # fail when any score < baseline
 *   pnpm test:evals --update-baseline     # write current scores as the new baseline
 *   pnpm test:evals --json                # emit machine-readable JSON to stdout
 *
 * The CLI resolves the Anthropic key from `seraphim/anthropic` via AWS
 * Secrets Manager. Set `ANTHROPIC_API_KEY` env var to override (handy for
 * local dev without AWS).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runEvalSuite } from './runner.js';
import type { EvalBaseline, EvalSuiteReport } from './types.js';

interface CliFlags {
  only?: string[];
  baselineCheck: boolean;
  updateBaseline: boolean;
  json: boolean;
  help: boolean;
}

const HERE = (() => {
  // CJS path
  if (typeof __dirname !== 'undefined') return __dirname;
  // Fallback for ESM (rare for this package, but safe).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const url = (eval('import.meta') as any)?.url as string | undefined;
  if (url) {
    const u = new URL('.', url);
    return u.pathname.replace(/^\/([A-Za-z]:)/, '$1');
  }
  return process.cwd();
})();
const BASELINE_PATH = join(HERE, 'baseline.json');

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    baselineCheck: false,
    updateBaseline: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--only') {
      const next = argv[++i] ?? '';
      flags.only = next.split(',').map((s) => s.trim()).filter(Boolean);
    }
    else if (a === '--baseline-check') flags.baselineCheck = true;
    else if (a === '--update-baseline') flags.updateBaseline = true;
    else if (a === '--json') flags.json = true;
  }
  return flags;
}

async function resolveApiKey(): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  // Try AWS Secrets Manager.
  try {
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
    const resp = await client.send(new GetSecretValueCommand({ SecretId: 'seraphim/anthropic' }));
    if (!resp.SecretString) throw new Error('SecretString missing');
    const parsed = JSON.parse(resp.SecretString) as Record<string, unknown>;
    const key = parsed.apiKey ?? parsed.api_key ?? parsed.ANTHROPIC_API_KEY ?? parsed.value;
    if (typeof key !== 'string' || !key) throw new Error('apiKey field missing');
    return key;
  } catch (err) {
    throw new Error(
      `Could not resolve Anthropic API key — set ANTHROPIC_API_KEY env var or ` +
      `ensure seraphim/anthropic is accessible (${(err as Error).message})`,
    );
  }
}

async function readBaseline(): Promise<EvalBaseline | null> {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    const text = await readFile(BASELINE_PATH, 'utf-8');
    return JSON.parse(text) as EvalBaseline;
  } catch {
    return null;
  }
}

async function writeBaseline(report: EvalSuiteReport): Promise<void> {
  const baseline: EvalBaseline = {
    version: 1,
    ranAt: report.ranAt,
    tasks: {},
  };
  for (const r of report.results) {
    const scorers: EvalBaseline['tasks'][string]['scorers'] = {} as never;
    for (const s of r.scorers) {
      (scorers as Record<string, number>)[s.scorer] = s.score;
    }
    baseline.tasks[r.taskId] = { total: r.total, scorers };
  }
  await writeFile(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
}

function compareToBaseline(report: EvalSuiteReport, baseline: EvalBaseline): { ok: boolean; regressions: string[] } {
  const regressions: string[] = [];
  for (const r of report.results) {
    const ref = baseline.tasks[r.taskId];
    if (!ref) continue; // new task — not a regression
    if (r.total < ref.total) {
      regressions.push(`${r.taskId}: ${r.total} (baseline ${ref.total})`);
    }
  }
  return { ok: regressions.length === 0, regressions };
}

function printHelp(): void {
  console.log(`
Eval suite — runs ~18 fixed tasks against the agent harness.

Usage:
  pnpm test:evals                              run all, informational
  pnpm test:evals --only <id1,id2,...>         run a subset
  pnpm test:evals --baseline-check             fail when any score regresses below baseline
  pnpm test:evals --update-baseline            write current scores as the new baseline
  pnpm test:evals --json                       machine-readable output

Auth: ANTHROPIC_API_KEY env var, or seraphim/anthropic in AWS Secrets Manager.
`);
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return 0;
  }

  let apiKey: string;
  try { apiKey = await resolveApiKey(); }
  catch (err) {
    console.error(`[eval-cli] ${(err as Error).message}`);
    return 2;
  }

  const report = await runEvalSuite({
    apiKey,
    only: flags.only,
    log: (...a) => console.log('[eval-cli]', ...a),
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.log('');
    console.log(`=== Eval results — ${report.totals.tasks} tasks, avg score ${report.totals.averageScore} ===`);
    for (const r of report.results) {
      const tag = r.passed ? '✓' : '✗';
      console.log(`  ${tag} ${r.taskId.padEnd(36)} ${String(r.total).padStart(3)}/100 (${r.durationMs}ms)`);
      if (!r.passed) {
        for (const s of r.scorers.filter((sc) => !sc.passed)) {
          console.log(`     · ${s.scorer}: ${s.details ?? 'failed'}`);
        }
      }
    }
    console.log('');
    console.log(`Pass: ${report.totals.passed} / Fail: ${report.totals.failed}`);
  }

  if (flags.updateBaseline) {
    await writeBaseline(report);
    console.log(`[eval-cli] baseline updated at ${BASELINE_PATH}`);
    return 0;
  }

  if (flags.baselineCheck) {
    const baseline = await readBaseline();
    if (!baseline) {
      console.log('[eval-cli] no baseline yet — run with --update-baseline once a clean run lands');
      return 0;
    }
    const { ok, regressions } = compareToBaseline(report, baseline);
    if (!ok) {
      console.error('[eval-cli] regressions:');
      for (const r of regressions) console.error(`  ${r}`);
      return 1;
    }
    console.log('[eval-cli] no regressions vs baseline.');
  }
  return report.totals.failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code), (err) => {
  console.error('[eval-cli] fatal:', err);
  process.exit(3);
});

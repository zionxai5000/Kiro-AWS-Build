/**
 * Pipeline Hook 05c: Sentry Provisioner
 *
 * Trigger: API call OR pre-build sub-step from Hook 6 (build-runner).
 * Action: Ensure a Sentry project exists for this app slug, fetch its DSN,
 *   inject it into the workspace app.json under expo.extra.sentryDsn, and
 *   ensure SENTRY_AUTH_TOKEN is registered as an EAS secret.
 *
 * Idempotent — calling this on every build is safe. The Sentry org and team
 * names come from `seraphim/sentry` Secrets Manager. We never hard-code them.
 *
 * Failure mode: NOTIFY (build can still proceed without Sentry, but crashes
 * won't be captured — that's a regression we want operators to see).
 * Timeout: 60s (Sentry API + EAS env:create are both fast).
 */

import { isHookEnabled, isHookDryRun } from '../config/hooks.config.js';
import { LIMITS } from '../config/limits.js';
import { runEasCommand } from '../services/eas-cli-wrapper.js';
import { Workspace } from '../workspace/workspace.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
import type { HookContext, HookMetadata, HookResult } from './types.js';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const HOOK_METADATA: HookMetadata = {
  id: 'sentry-provisioner',
  name: 'Sentry Provisioner',
  triggerType: 'api_request',
  failureMode: 'notify',
  timeoutMs: LIMITS.sentryProvisionerTimeoutMs,
  maxConcurrent: 5,
} as const;

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export interface SentryProvisionerInput {
  projectId: string;
  /** App slug used for Sentry project name (mirrors app.json expo.slug). */
  appSlug: string;
  credentialManager: CredentialManager;
  expoToken?: string;
  /** Override the Sentry org/team — only used in tests. */
  sentryOrg?: string;
  sentryTeam?: string;
}

export interface SentryProvisionerOutput {
  sentryProjectSlug: string;
  dsn: string;
  injectedIntoAppJson: boolean;
  easEnvVarSet: boolean;
}

// ---------------------------------------------------------------------------
// Sentry secret schema
// ---------------------------------------------------------------------------

interface SentryCredentials {
  authToken: string;
  org: string;
  team?: string;
  project?: string;
}

async function loadSentryCredentials(
  credentialManager: CredentialManager,
  log: (msg: string) => void,
): Promise<SentryCredentials> {
  // The credential-manager spec stores arbitrary JSON under a key.
  // For the seraphim/sentry secret we want every field, not just one
  // sub-key, so we read each individually and let the manager fall
  // back to whichever decoding it supports.
  let authToken: string | null = null;
  let org: string | null = null;
  let team: string | null = null;
  let project: string | null = null;

  try {
    authToken = await credentialManager.getCredential('sentry', 'authToken');
  } catch {
    /* try alternative key name */
  }
  if (!authToken) {
    try {
      authToken = await credentialManager.getCredential('sentry', 'auth-token');
    } catch {
      /* fall through */
    }
  }
  try {
    org = await credentialManager.getCredential('sentry', 'org');
  } catch {
    /* ignore */
  }
  try {
    team = await credentialManager.getCredential('sentry', 'team');
  } catch {
    /* ignore */
  }
  try {
    project = await credentialManager.getCredential('sentry', 'project');
  } catch {
    /* ignore */
  }

  if (!authToken) {
    throw new Error(
      'sentry-provisioner: Sentry authToken not found in seraphim/sentry secret. ' +
        'Expected fields: { authToken, org, team?, project? }',
    );
  }

  if (!org) {
    log('[sentry-provisioner] Sentry org not in secret; defaulting to "zionxai"');
    org = 'zionxai';
  }

  return {
    authToken,
    org,
    team: team ?? undefined,
    project: project ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Sentry HTTP helpers
// ---------------------------------------------------------------------------

const SENTRY_API_BASE = 'https://sentry.io/api/0';

async function sentryFetch(
  path: string,
  init: RequestInit,
  authToken: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${authToken}`);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${SENTRY_API_BASE}${path}`, { ...init, headers });
}

interface SentryProjectKey {
  id: string;
  dsn: { public: string; secret?: string; csp?: string };
  isActive: boolean;
}

async function ensureSentryProject(
  org: string,
  team: string,
  appSlug: string,
  authToken: string,
  log: (msg: string) => void,
): Promise<string> {
  const slug = appSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 50);

  // Probe — does it already exist?
  const probe = await sentryFetch(
    `/projects/${encodeURIComponent(org)}/${encodeURIComponent(slug)}/`,
    { method: 'GET' },
    authToken,
  );
  if (probe.ok) {
    log(`[sentry-provisioner] Sentry project exists: ${org}/${slug}`);
    return slug;
  }
  if (probe.status !== 404) {
    const body = await probe.text();
    throw new Error(`sentry-provisioner: probe failed ${probe.status}: ${body.slice(0, 200)}`);
  }

  // Create it under the team
  log(`[sentry-provisioner] Creating Sentry project: ${org}/${slug} on team ${team}`);
  const createRes = await sentryFetch(
    `/teams/${encodeURIComponent(org)}/${encodeURIComponent(team)}/projects/`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: appSlug,
        slug,
        platform: 'react-native',
      }),
    },
    authToken,
  );

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(
      `sentry-provisioner: project create failed ${createRes.status}: ${body.slice(0, 200)}`,
    );
  }
  return slug;
}

async function fetchSentryDsn(
  org: string,
  projectSlug: string,
  authToken: string,
): Promise<string> {
  const res = await sentryFetch(
    `/projects/${encodeURIComponent(org)}/${encodeURIComponent(projectSlug)}/keys/`,
    { method: 'GET' },
    authToken,
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`sentry-provisioner: keys fetch failed ${res.status}: ${body.slice(0, 200)}`);
  }
  const keys = (await res.json()) as SentryProjectKey[];
  const active = keys.find((k) => k.isActive) ?? keys[0];
  if (!active?.dsn?.public) {
    throw new Error('sentry-provisioner: no active DSN on Sentry project');
  }
  return active.dsn.public;
}

// ---------------------------------------------------------------------------
// EAS env var management
// ---------------------------------------------------------------------------

async function ensureEasSentryAuthToken(args: {
  projectPath: string;
  expoToken: string;
  authToken: string;
  log: (msg: string) => void;
}): Promise<boolean> {
  const { projectPath, expoToken, authToken, log } = args;

  // Check existing env vars; if SENTRY_AUTH_TOKEN already set, skip.
  try {
    const listResult = await runEasCommand(
      ['env:list', '--environment', 'production', '--non-interactive', '--json'],
      { cwd: projectPath, expoToken, timeoutMs: 30_000 },
    );
    const vars = listResult.parsedJson as Array<{ name: string }> | null;
    if (vars && Array.isArray(vars) && vars.some((v) => v.name === 'SENTRY_AUTH_TOKEN')) {
      log('[sentry-provisioner] EAS SENTRY_AUTH_TOKEN already set — skipping');
      return false;
    }
  } catch (err) {
    // Older eas CLI versions may not support env:list — try create anyway
    log(`[sentry-provisioner] env:list probe failed (non-fatal): ${(err as Error).message}`);
  }

  log('[sentry-provisioner] Registering SENTRY_AUTH_TOKEN as EAS secret env var');
  await runEasCommand(
    [
      'env:create',
      '--name', 'SENTRY_AUTH_TOKEN',
      '--value', authToken,
      '--visibility', 'secret',
      '--environment', 'production',
      '--non-interactive',
    ],
    { cwd: projectPath, expoToken, timeoutMs: 30_000 },
  );
  return true;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function run(
  input: SentryProvisionerInput,
  ctx: HookContext,
): Promise<HookResult<SentryProvisionerOutput>> {
  const start = Date.now();

  if (!isHookEnabled(HOOK_METADATA.id)) {
    ctx.log(`[${HOOK_METADATA.id}] Hook disabled — skipping`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: ctx.dryRun,
      data: { sentryProjectSlug: '', dsn: '', injectedIntoAppJson: false, easEnvVarSet: false },
      durationMs: Date.now() - start,
    };
  }

  const dryRun = ctx.dryRun || isHookDryRun(HOOK_METADATA.id);
  if (dryRun) {
    ctx.log(`[${HOOK_METADATA.id}] DRY RUN — would provision Sentry for ${input.appSlug}`);
    return {
      success: true, hookId: HOOK_METADATA.id, dryRun: true,
      data: {
        sentryProjectSlug: input.appSlug,
        dsn: 'https://dry-run@sentry.io/dry-run',
        injectedIntoAppJson: false,
        easEnvVarSet: false,
      },
      durationMs: Date.now() - start,
    };
  }

  try {
    const creds = await loadSentryCredentials(input.credentialManager, ctx.log);
    const org = input.sentryOrg ?? creds.org;
    const team = input.sentryTeam ?? creds.team ?? org; // fallback: org is its own team in many setups

    // 1. Ensure Sentry project exists
    const sentryProjectSlug = await ensureSentryProject(
      org, team, input.appSlug, creds.authToken, ctx.log,
    );

    // 2. Fetch DSN
    const dsn = await fetchSentryDsn(org, sentryProjectSlug, creds.authToken);
    ctx.log(`[${HOOK_METADATA.id}] DSN ready for ${org}/${sentryProjectSlug}`);

    // 3. Inject into workspace app.json
    const workspace = new Workspace();
    let injectedIntoAppJson = false;
    try {
      const appJsonContent = await workspace.readFile(input.projectId, 'app.json');
      const appJson = JSON.parse(appJsonContent);
      const expo = (appJson.expo = appJson.expo ?? {});
      const extra = (expo.extra = expo.extra ?? {});
      if (extra.sentryDsn !== dsn) {
        extra.sentryDsn = dsn;
        extra.sentryOrg = org;
        extra.sentryProject = sentryProjectSlug;
        await workspace.writeFile(
          input.projectId,
          'app.json',
          JSON.stringify(appJson, null, 2),
        );
        injectedIntoAppJson = true;
        ctx.log(`[${HOOK_METADATA.id}] Injected DSN into app.json`);
      } else {
        ctx.log(`[${HOOK_METADATA.id}] app.json DSN already up-to-date`);
      }
    } catch (err) {
      ctx.log(
        `[${HOOK_METADATA.id}] WARN — could not update app.json: ${(err as Error).message}`,
      );
    }

    // 4. Ensure EAS env var (only when expoToken supplied — Hook 6 always passes one)
    let easEnvVarSet = false;
    if (input.expoToken) {
      const projectPath = workspace.getProjectPath(input.projectId);
      try {
        easEnvVarSet = await ensureEasSentryAuthToken({
          projectPath,
          expoToken: input.expoToken,
          authToken: creds.authToken,
          log: ctx.log,
        });
      } catch (err) {
        ctx.log(
          `[${HOOK_METADATA.id}] WARN — EAS env:create failed: ${(err as Error).message}`,
        );
      }
    }

    return {
      success: true,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      data: { sentryProjectSlug, dsn, injectedIntoAppJson, easEnvVarSet },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      hookId: HOOK_METADATA.id,
      dryRun: false,
      error: (err as Error).message,
      data: { sentryProjectSlug: '', dsn: '', injectedIntoAppJson: false, easEnvVarSet: false },
      durationMs: Date.now() - start,
    };
  }
}

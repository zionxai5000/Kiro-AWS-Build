/**
 * Phase 2: Create the Sentry project for the meditation timer app, then
 * pull its DSN (the URL the SDK uses to send events).
 *
 * If the project already exists, reuse it. The DSN is printed at the end
 * — that's what gets injected into app.json -> expo.extra.sentryDsn.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const SENTRY_BASE = 'https://sentry.io/api/0';
const PROJECT_SLUG = 'mindful-timer';
const PROJECT_NAME = 'mindful-timer';
const PLATFORM = 'react-native';

function getSentrySecret() {
  const scriptPath = join(process.cwd(), 'scripts', '_get-sentry-temp.ps1');
  writeFileSync(
    scriptPath,
    `$r = aws secretsmanager get-secret-value --secret-id "seraphim/sentry" --region us-east-1 --output json | ConvertFrom-Json\n` +
    `Write-Output $r.SecretString\n`,
    'utf-8',
  );
  try {
    const raw = execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return JSON.parse(raw.trim());
  } finally {
    try { unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

async function api(token: string, method: string, path: string, body?: any) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${SENTRY_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function main() {
  const sec = getSentrySecret();
  const token = sec.authToken;
  const org = sec.org;

  console.log(`org=${org}, project_slug=${PROJECT_SLUG}\n`);

  // 1. Check if project already exists
  console.log('=== Checking if project exists ===');
  const existing = await api(token, 'GET', `/projects/${org}/${PROJECT_SLUG}/`);
  console.log(`  HTTP ${existing.status}`);

  let project: any;
  if (existing.status === 200) {
    project = existing.body;
    console.log(`  Reusing project ${project.slug} (id=${project.id})`);
  } else if (existing.status === 404) {
    // 2. Create the project
    console.log('\n=== Creating project ===');
    // Need a team slug — use the first team
    const teams = await api(token, 'GET', `/organizations/${org}/teams/`);
    const teamSlug = teams.body[0]?.slug;
    if (!teamSlug) {
      console.log('No team available to host the project.');
      process.exit(1);
    }
    console.log(`  team: ${teamSlug}`);
    const create = await api(token, 'POST', `/teams/${org}/${teamSlug}/projects/`, {
      name: PROJECT_NAME,
      slug: PROJECT_SLUG,
      platform: PLATFORM,
      default_rules: true,
    });
    console.log(`  HTTP ${create.status}`);
    if (create.status >= 400) {
      console.log(`  body: ${JSON.stringify(create.body).slice(0, 400)}`);
      process.exit(1);
    }
    project = create.body;
    console.log(`  Created project ${project.slug} (id=${project.id})`);
  } else {
    console.log(`  Unexpected status. body: ${JSON.stringify(existing.body).slice(0, 400)}`);
    process.exit(1);
  }

  // 3. Get the DSN (client key)
  console.log('\n=== Fetching DSN (client key) ===');
  const keys = await api(token, 'GET', `/projects/${org}/${PROJECT_SLUG}/keys/`);
  console.log(`  HTTP ${keys.status}`);
  if (keys.status !== 200 || !Array.isArray(keys.body) || keys.body.length === 0) {
    console.log(`  No keys found. body: ${JSON.stringify(keys.body).slice(0, 400)}`);
    process.exit(1);
  }
  const activeKey = keys.body.find((k: any) => k.isActive) ?? keys.body[0];
  const dsn = activeKey.dsn?.public;
  if (!dsn) {
    console.log(`  No public DSN. Key: ${JSON.stringify(activeKey).slice(0, 400)}`);
    process.exit(1);
  }

  console.log('\n=== DSN ===');
  console.log(dsn);
  console.log('');
  console.log('Phase 2 OK. This DSN gets written into app.json -> expo.extra.sentryDsn.');

  // 4. Persist the project slug + DSN to a local file so Phase 3 can inject it
  const out = {
    org,
    project: PROJECT_SLUG,
    dsn,
    publicKeyId: activeKey.id,
    projectId: project.id,
  };
  writeFileSync(join(process.cwd(), 'scripts', 'sentry-project.json'), JSON.stringify(out, null, 2));
  console.log('Wrote scripts/sentry-project.json for Phase 3.');

  // 5. Update the secret with the project slug
  const updated = { authToken: token, org, project: PROJECT_SLUG };
  const secretFile = join(process.cwd(), 'scripts', '_sentry-update.json');
  writeFileSync(secretFile, JSON.stringify(updated));
  try {
    execSync(
      `aws secretsmanager update-secret --secret-id seraphim/sentry --region us-east-1 --secret-string file://scripts/_sentry-update.json`,
      { stdio: 'inherit' },
    );
  } finally {
    try { unlinkSync(secretFile); } catch { /* ignore */ }
  }
  console.log('Secret updated with project slug.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

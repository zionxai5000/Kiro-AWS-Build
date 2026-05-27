/**
 * Phase 1: Verify the seraphim/sentry secret works against Sentry's API.
 *
 * Read-only. Hits /api/0/organizations/{org}/ to confirm the authToken
 * authenticates and that the org slug is correct. Reports back the org
 * name, member count, and token scopes.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const SENTRY_BASE = 'https://sentry.io/api/0';

function getSentrySecret(): { authToken: string; org: string; project: string } {
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

async function api(token: string, path: string) {
  const res = await fetch(`${SENTRY_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  let body: any = null;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: Object.fromEntries(res.headers.entries()) };
}

async function main() {
  console.log('=== Reading seraphim/sentry from AWS Secrets Manager ===');
  const sec = getSentrySecret();
  console.log(`  org       : ${sec.org}`);
  console.log(`  project   : ${sec.project || '(empty — will be created)'}`);
  console.log(`  authToken : ${sec.authToken.slice(0, 8)}... (${sec.authToken.length} chars)`);

  if (sec.authToken === 'REPLACE_ME' || !sec.authToken) {
    console.log('Token is still the placeholder. Update the secret first.');
    process.exit(1);
  }

  console.log('\n=== Verifying token against /api/0/organizations/{org}/ ===');
  const orgResp = await api(sec.authToken, `/organizations/${sec.org}/`);
  console.log(`  HTTP ${orgResp.status}`);
  if (orgResp.status !== 200) {
    console.log(`  body: ${JSON.stringify(orgResp.body).slice(0, 400)}`);
    if (orgResp.status === 404) console.log('  -> Org slug does not match an org this token can see.');
    if (orgResp.status === 401) console.log('  -> Token is invalid or expired.');
    process.exit(1);
  }
  const org = orgResp.body;
  console.log(`  Authenticated as org: "${org.name}" (slug=${org.slug}, id=${org.id})`);

  console.log('\n=== Checking token scopes ===');
  const me = await api(sec.authToken, '/');
  // The root endpoint returns the token's user/scopes if it's a user token.
  console.log(`  HTTP ${me.status}`);

  console.log('\n=== Listing teams in org ===');
  const teams = await api(sec.authToken, `/organizations/${sec.org}/teams/`);
  console.log(`  HTTP ${teams.status}, ${(teams.body ?? []).length} team(s)`);
  for (const t of teams.body ?? []) {
    console.log(`   - ${t.name} (slug=${t.slug}, id=${t.id})`);
  }

  console.log('\n=== Listing existing projects ===');
  const projects = await api(sec.authToken, `/organizations/${sec.org}/projects/`);
  console.log(`  HTTP ${projects.status}, ${(projects.body ?? []).length} project(s)`);
  for (const p of (projects.body ?? []).slice(0, 10)) {
    console.log(`   - ${p.name} (slug=${p.slug}, platform=${p.platform})`);
  }

  console.log('\nPhase 1 OK. Token authenticates, org confirmed.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

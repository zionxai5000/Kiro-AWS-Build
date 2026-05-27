/**
 * The org slug in the secret (ZionxAi) is wrong. Sentry returns 404.
 * Hit /api/0/organizations/ which lists every org the token can see —
 * that tells us the correct slug to put in the secret.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

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

async function main() {
  const sec = getSentrySecret();
  console.log(`Token: ${sec.authToken.slice(0, 8)}... (${sec.authToken.length} chars)\n`);

  const res = await fetch('https://sentry.io/api/0/organizations/', {
    headers: { Authorization: `Bearer ${sec.authToken}`, Accept: 'application/json' },
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  if (res.status !== 200) {
    console.log(text.slice(0, 500));
    process.exit(1);
  }
  const orgs = JSON.parse(text);
  console.log(`Found ${orgs.length} org(s) this token can see:\n`);
  for (const o of orgs) {
    console.log(`  name=${o.name}`);
    console.log(`  slug=${o.slug}    <-- this is what goes in the secret`);
    console.log(`  id  =${o.id}`);
    console.log('');
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

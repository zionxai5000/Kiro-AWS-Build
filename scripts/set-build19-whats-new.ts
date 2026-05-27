/**
 * One-shot: set 'What to Test' on Build #19 so TestFlight stops glitching.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { signAscJwt } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-jwt.js';
import { parseAscSecret } from '../packages/app/src/zionx/app-development/utils/parse-asc-secret.js';

const BASE = 'https://api.appstoreconnect.apple.com';
const BUILD_ID = 'ba68d2ee-745a-44bd-91a6-3d675cdbe0aa'; // Build #19 ASC id
const WHATS_NEW = 'Initial test build of testapplication5.26.2.26 — meditation timer with onboarding, themes, and persistence.';

function getRawAscSecret(): string {
  const scriptPath = join(process.cwd(), 'scripts', '_get-asc-temp.ps1');
  writeFileSync(
    scriptPath,
    `$r = aws secretsmanager get-secret-value --secret-id "seraphim/appstoreconnect" --region us-east-1 --output json | ConvertFrom-Json\n` +
    `Write-Output $r.SecretString\n`,
    'utf-8',
  );
  try {
    return execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } finally {
    try { unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

async function main() {
  const creds = parseAscSecret(getRawAscSecret());
  const jwt = signAscJwt(creds.keyId, creds.issuerId, creds.apiKey);

  const headers = {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const res = await fetch(`${BASE}/v1/betaBuildLocalizations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      data: {
        type: 'betaBuildLocalizations',
        attributes: { locale: 'en-US', whatsNew: WHATS_NEW },
        relationships: {
          build: { data: { type: 'builds', id: BUILD_ID } },
        },
      },
    }),
  });
  const text = await res.text();
  console.log(`status: ${res.status}`);
  console.log(text.slice(0, 500));
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

/**
 * Apply the new Hook 9b post-submission step (setBetaWhatsNew) to Build #20.
 * This is the same code path the production pipeline runs automatically after
 * every successful eas submit. Running it here proves the integration end-to-end.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { signAscJwt } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-jwt.js';
import { setBetaWhatsNew } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-app-client.js';
import { parseAscSecret } from '../packages/app/src/zionx/app-development/utils/parse-asc-secret.js';

const BUILD_ID = '6d17c6cd-add1-44a3-b460-7f84053ea696'; // Build #20 ASC id
const WHATS_NEW = 'Build #20 — first build through the new auto-submit + TestFlight watcher pipeline. Includes Sentry observability, "What to Test" auto-set, and the iOS 26 TurboModule patch.';

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
  await setBetaWhatsNew(jwt, BUILD_ID, WHATS_NEW);
  console.log('whatsNew applied to Build #20.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

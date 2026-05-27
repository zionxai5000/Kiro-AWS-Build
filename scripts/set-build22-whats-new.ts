import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { signAscJwt } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-jwt.js';
import { setBetaWhatsNew } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-app-client.js';
import { parseAscSecret } from '../packages/app/src/zionx/app-development/utils/parse-asc-secret.js';

const BUILD_ID = 'c18767ef-605b-4cc7-99fc-06407bbc3a81';
const WHATS_NEW = 'Build #22 — Sentry observability enabled. Any runtime error in this build is captured in real-time.';

function getRawAscSecret(): string {
  const scriptPath = join(process.cwd(), 'scripts', '_get-asc-temp.ps1');
  writeFileSync(scriptPath, `$r = aws secretsmanager get-secret-value --secret-id "seraphim/appstoreconnect" --region us-east-1 --output json | ConvertFrom-Json\nWrite-Output $r.SecretString\n`, 'utf-8');
  try { return execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 }); }
  finally { try { unlinkSync(scriptPath); } catch { } }
}

(async () => {
  const creds = parseAscSecret(getRawAscSecret());
  const jwt = signAscJwt(creds.keyId, creds.issuerId, creds.apiKey);
  await setBetaWhatsNew(jwt, BUILD_ID, WHATS_NEW);
  console.log('whatsNew applied to Build #22');
})().catch((e) => { console.error(e); process.exit(1); });

/**
 * One-shot diagnostic: ask App Store Connect what state Build #19 is in.
 * Uses the AWS Secrets Manager credentials (no env vars assumed).
 * This is the same query Hook 10b runs every 30 seconds in the live pipeline.
 */
import { execFileSync, execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { signAscJwt } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-jwt.js';
import { listAscBuilds } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-app-client.js';
import { parseAscSecret } from '../packages/app/src/zionx/app-development/utils/parse-asc-secret.js';

const ASC_APP_ID = '6773520429';
const APP_VERSION = '1.0.0';
const BUILD_NUMBER = '4';

function getRawAscSecret(): string {
  // Use PowerShell wrapper because execSync mangles \r\n in PEM keys on Windows.
  const scriptPath = join(process.cwd(), 'scripts', '_get-asc-temp.ps1');
  writeFileSync(
    scriptPath,
    `$r = aws secretsmanager get-secret-value --secret-id "seraphim/appstoreconnect" --region us-east-1 --output json | ConvertFrom-Json\n` +
    `Write-Output $r.SecretString\n`,
    'utf-8',
  );
  try {
    const out = execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, {
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return out;
  } finally {
    try { unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

async function main() {
  console.log('=== Reading App Store Connect credentials from AWS Secrets Manager ===');
  const raw = getRawAscSecret();
  const creds = parseAscSecret(raw);
  console.log(`  keyId   = ${creds.keyId}`);
  console.log(`  issuer  = ${creds.issuerId}`);
  console.log(`  apiKey  = (PEM, ${creds.apiKey.length} chars)`);

  const jwt = signAscJwt(creds.keyId, creds.issuerId, creds.apiKey);
  console.log('=== JWT signed ===\n');

  const builds = await listAscBuilds(jwt, ASC_APP_ID, 10);
  console.log(`=== Found ${builds.length} builds for ASC app ${ASC_APP_ID} ===`);
  for (const b of builds) {
    const tag = (b.appVersion === APP_VERSION && b.version === BUILD_NUMBER) ? '   <-- TARGET (Build #19)' : '';
    console.log(`  ${b.buildId}  ${b.appVersion} #${b.version}  state=${b.processingState}  betaReview=${b.betaReviewState ?? '-'}  uploaded=${b.uploadedDate ?? '-'}${tag}`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

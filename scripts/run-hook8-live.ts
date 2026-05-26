/**
 * Hook 8 LIVE Runner — Create ASC Entity + Upload Metadata
 *
 * Creates the App Store Connect app entity for the test workspace,
 * uploads store listing metadata, and returns the ascAppId needed
 * for eas submit.
 *
 * Usage: npx tsx scripts/run-hook8-live.ts
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { run as runStoreListingWriter } from '../packages/app/src/zionx/app-development/pipeline/08-store-listing-writer.js';
import { Workspace } from '../packages/app/src/zionx/app-development/workspace/workspace.js';
import type { CredentialManager } from '../packages/core/src/interfaces/credential-manager.js';

// Disable dry-run for Hook 8
import { HOOKS_CONFIG } from '../packages/app/src/zionx/app-development/config/hooks.config.js';
HOOKS_CONFIG.hooks['store-listing-writer']!.dryRun = false;

function getAnthropicKey(): string {
  const raw = execSync(
    'aws secretsmanager get-secret-value --secret-id "seraphim/anthropic" --region us-east-1 --query "SecretString" --output text',
    { encoding: 'utf-8' },
  ).trim();
  try { const p = JSON.parse(raw); return p.apiKey ?? p.api_key ?? p.key ?? raw; }
  catch { return raw; }
}

function getAscCredentials(): { apiKey: string; keyId: string; issuerId: string } {
  const scriptPath = join(process.cwd(), 'scripts', '_get-asc-temp.ps1');
  writeFileSync(scriptPath, `
$r = aws secretsmanager get-secret-value --secret-id "seraphim/appstoreconnect" --region us-east-1 --output json | ConvertFrom-Json
$p = $r.SecretString | ConvertFrom-Json
@{ keyId = $p.keyId; issuerId = $p.issuerId; apiKey = $p.apiKey } | ConvertTo-Json -Compress
`);
  try {
    const raw = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 },
    ).trim();
    return JSON.parse(raw);
  } finally {
    try { require('node:fs').unlinkSync(scriptPath); } catch {}
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Hook 8 LIVE — Create ASC Entity + Upload Metadata');
  console.log('═══════════════════════════════════════════════════════════');

  const anthropicKey = getAnthropicKey();
  const asc = getAscCredentials();
  console.log(`[setup] ASC keyId=${asc.keyId}, issuerId=${asc.issuerId}`);
  console.log(`[setup] ASC apiKey length=${asc.apiKey.length}`);
  console.log(`[setup] Anthropic key length=${anthropicKey.length}`);

  const credentialManager: CredentialManager = {
    async getCredential(driver: string, key: string): Promise<string> {
      if (driver === 'anthropic' && key === 'api-key') return anthropicKey;
      if (driver === 'appstore-connect' && key === 'api-key') return asc.apiKey;
      if (driver === 'appstore-connect' && key === 'key-id') return asc.keyId;
      if (driver === 'appstore-connect' && key === 'issuer-id') return asc.issuerId;
      return 'mock';
    },
    async rotateCredential() { return { success: false, driverName: '' }; },
    async getRotationSchedule() { return []; },
  };

  const projectId = 'proj-1779820658954-0bc986e3';

  console.log('');
  console.log('[hook8] Starting store listing writer...');
  console.log('');

  const result = await runStoreListingWriter(
    {
      projectId,
      appName: 'testapplication5.26.2.26',
      appDescription: 'A meditation timer app with breathing exercises, session history, and daily streaks.',
      credentialManager,
    } as any,
    {
      executionId: `hook8-live-${Date.now()}`,
      dryRun: false,
      startedAt: new Date().toISOString(),
      log: (msg: string) => console.log(`  ${msg}`),
    },
  );

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Success: ${result.success}`);
  console.log(`  ASC App ID: ${(result.data as any)?.ascAppId ?? 'null'}`);
  console.log(`  Listing generated: ${(result.data as any)?.listing != null}`);
  console.log(`  Screenshots: ${(result.data as any)?.screenshotsGenerated ?? 0}`);
  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});

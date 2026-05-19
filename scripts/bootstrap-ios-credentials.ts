#!/usr/bin/env npx tsx
/**
 * iOS Credential Bootstrap — CLI Entry Point
 *
 * Reads credentials from AWS Secrets Manager, configures iOS build
 * credentials at Apple and EAS. Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-ios-credentials.ts --workspace workspaces/e2e-clean-001
 *   npx tsx scripts/bootstrap-ios-credentials.ts --workspace workspaces/e2e-clean-001 --dry-run
 *   npx tsx scripts/bootstrap-ios-credentials.ts --workspace workspaces/e2e-clean-001 --revoke-cert <serial>
 *
 * Exit codes:
 *   0 = All credentials ready
 *   1 = Unrecoverable error
 *   2 = Max certs reached — needs --revoke-cert
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  bootstrapIosCredentials,
  BootstrapMaxCertsError,
  BootstrapError,
} from '../packages/app/src/zionx/app-development/services/apple-credentials/bootstrap-flow.js';

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  workspace: string;
  revokeCertSerial?: string;
  dryRun: boolean;
  verbose: boolean;
  appleTeamId: string;
  accountName: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let workspace = '';
  let revokeCertSerial: string | undefined;
  let dryRun = false;
  let verbose = false;
  let appleTeamId = 'FBDY34F9DY';
  let accountName = 'zionxai';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--workspace': workspace = args[++i] ?? ''; break;
      case '--revoke-cert': revokeCertSerial = args[++i]; break;
      case '--dry-run': dryRun = true; break;
      case '--verbose': verbose = true; break;
      case '--apple-team-id': appleTeamId = args[++i] ?? appleTeamId; break;
      case '--account-name': accountName = args[++i] ?? accountName; break;
    }
  }

  if (!workspace) {
    console.error('Usage: npx tsx scripts/bootstrap-ios-credentials.ts --workspace <path> [--dry-run] [--revoke-cert <serial>]');
    process.exit(1);
  }

  return { workspace, revokeCertSerial, dryRun, verbose, appleTeamId, accountName };
}

// ---------------------------------------------------------------------------
// Secret Loading
// ---------------------------------------------------------------------------

async function loadSecrets(region: string): Promise<{
  ascKeyId: string;
  ascIssuerId: string;
  ascKeyPem: string;
  expoToken: string;
}> {
  const smClient = new SecretsManagerClient({ region });

  // Load App Store Connect credentials
  const ascResp = await smClient.send(
    new GetSecretValueCommand({ SecretId: 'seraphim/appstoreconnect' }),
  );
  const ascStr = ascResp.SecretString!;

  // Parse — the secret has real newlines in apiKey field
  const keyIdMatch = ascStr.match(/"keyId"\s*:\s*"([^"]+)"/);
  const issuerIdMatch = ascStr.match(/"issuerId"\s*:\s*"([^"]+)"/);

  if (!keyIdMatch || !issuerIdMatch) {
    throw new Error('Could not parse seraphim/appstoreconnect secret');
  }

  // Extract apiKey (spans multiple lines due to .p8 content)
  const apiStart = ascStr.indexOf('"apiKey"');
  const valueStart = ascStr.indexOf('"', apiStart + 8) + 1;
  const endMarker = '-----END PRIVATE KEY-----';
  const endIdx = ascStr.indexOf(endMarker, valueStart);
  const ascKeyPem = ascStr.slice(valueStart, endIdx + endMarker.length);

  // Load Expo token
  const expoResp = await smClient.send(
    new GetSecretValueCommand({ SecretId: 'seraphim/expo' }),
  );
  const expoStr = expoResp.SecretString!;
  const tokenMatch = expoStr.match(/accessToken[:\s]+([^},]+)/);
  if (!tokenMatch) {
    throw new Error('Could not parse seraphim/expo secret');
  }

  return {
    ascKeyId: keyIdMatch[1]!,
    ascIssuerId: issuerIdMatch[1]!,
    ascKeyPem,
    expoToken: tokenMatch[1]!.trim(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const cliArgs = parseArgs();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  iOS Credential Bootstrap');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Workspace:    ${cliArgs.workspace}`);
  console.log(`  Dry Run:      ${cliArgs.dryRun ? 'YES' : 'no'}`);
  console.log(`  Apple Team:   ${cliArgs.appleTeamId}`);
  console.log(`  EAS Account:  ${cliArgs.accountName}`);
  if (cliArgs.revokeCertSerial) {
    console.log(`  Revoke Cert:  ${cliArgs.revokeCertSerial}`);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Load secrets
  console.log('Loading credentials from AWS Secrets Manager...');
  const secrets = await loadSecrets('us-east-1');
  console.log(`  ASC Key ID: ${secrets.ascKeyId.length} chars`);
  console.log(`  ASC Issuer ID: ${secrets.ascIssuerId.length} chars`);
  console.log(`  ASC Key PEM: ${secrets.ascKeyPem.length} chars`);
  console.log(`  Expo Token: ${secrets.expoToken.length} chars`);
  console.log('');

  // Read bundle identifier from workspace app.json
  const appJsonPath = resolve(cliArgs.workspace, 'app.json');
  const appJsonContent = readFileSync(appJsonPath, 'utf-8');
  const appJson = JSON.parse(appJsonContent);
  const bundleIdentifier = appJson?.expo?.ios?.bundleIdentifier;
  const slug = appJson?.expo?.slug ?? 'app';

  if (!bundleIdentifier) {
    throw new BootstrapError(`No expo.ios.bundleIdentifier found in ${appJsonPath}`);
  }

  console.log(`  Bundle ID: ${bundleIdentifier}`);
  console.log(`  Project: @${cliArgs.accountName}/${slug}`);
  console.log('');

  // Run bootstrap
  const log = (msg: string) => {
    if (cliArgs.verbose || msg.includes('[Step') || msg.includes('[DRY-RUN]')) {
      console.log(`  ${msg}`);
    }
  };

  const result = await bootstrapIosCredentials({
    ascKeyId: secrets.ascKeyId,
    ascIssuerId: secrets.ascIssuerId,
    ascKeyPem: secrets.ascKeyPem,
    appleTeamId: cliArgs.appleTeamId,
    appleTeamType: 'INDIVIDUAL',
    expoToken: secrets.expoToken,
    easAccountName: cliArgs.accountName,
    bundleIdentifier,
    projectFullName: `@${cliArgs.accountName}/${slug}`,
    revokeCertSerial: cliArgs.revokeCertSerial,
    dryRun: cliArgs.dryRun,
  }, log);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✅ Bootstrap complete');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Created: ${result.created.length > 0 ? result.created.join(', ') : 'none'}`);
  console.log(`  Reused:  ${result.reused.length > 0 ? result.reused.join(', ') : 'none'}`);
  console.log('');
  console.log(`  EAS Distribution Cert:    ${result.easCertId}`);
  console.log(`  EAS Provisioning Profile: ${result.easProfileId}`);
  console.log(`  EAS App Identifier:       ${result.easAppIdentifierId}`);
  console.log(`  EAS ASC API Key:          ${result.easAscKeyId}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  if (err instanceof BootstrapMaxCertsError) {
    console.error('\n❌ ' + err.message);
    process.exit(2);
  }
  if (err instanceof BootstrapError) {
    console.error('\n❌ Bootstrap error: ' + err.message);
    process.exit(1);
  }
  console.error('\n💥 Unexpected error:', err.message);
  process.exit(1);
});

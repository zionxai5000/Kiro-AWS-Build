/**
 * Diagnose: why does TestFlight say 'Something went wrong'?
 *
 * Apple's ASC API tells us:
 * - Build state (VALID/INVALID) — the binary is fine
 * - Beta review state — whether external testers can run it
 * - Beta groups assigned — whether the user's iCloud account is in a group
 *   that has access
 * - Encryption export compliance — required before any tester can install
 * - Missing-compliance flag
 *
 * The TestFlight client surfaces 'Something went wrong' when ANY of:
 *   - the build hasn't been added to a beta group the user is in
 *   - encryption export compliance is missing
 *   - the build is still on the 'What to Test' / Beta App Information step
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { signAscJwt } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-jwt.js';
import { parseAscSecret } from '../packages/app/src/zionx/app-development/utils/parse-asc-secret.js';

const BASE = 'https://api.appstoreconnect.apple.com';
const ASC_APP_ID = '6773520429';
// Apple build numbers are different from local app.json buildNumber when
// eas.json uses appVersionSource: 'remote' — EAS auto-increments. Build #19
// (our 4th submission) appears as version='19' on Apple's side.
const TARGET_BUILD_VERSION = '19';
const TARGET_APP_VERSION = '1.0.0';

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

async function api(jwt: string, path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${path}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  const creds = parseAscSecret(getRawAscSecret());
  const jwt = signAscJwt(creds.keyId, creds.issuerId, creds.apiKey);

  // Find the build
  const buildsList = await api(
    jwt,
    `/v1/builds?filter[app]=${ASC_APP_ID}&sort=-uploadedDate&limit=10`
  );
  const target = buildsList.data.find((b: any) =>
    b.attributes.version === TARGET_BUILD_VERSION
  );
  if (!target) {
    console.log('Target build not found in latest 10 builds. Available:');
    for (const b of buildsList.data ?? []) {
      console.log(`  version="${b.attributes.version}" state=${b.attributes.processingState}`);
    }
    return;
  }

  const buildId = target.id;
  console.log(`=== Build ${TARGET_APP_VERSION} #${TARGET_BUILD_VERSION} (ASC id ${buildId}) ===`);
  console.log(`  processingState        : ${target.attributes.processingState}`);
  console.log(`  uploadedDate           : ${target.attributes.uploadedDate}`);
  console.log(`  expirationDate         : ${target.attributes.expirationDate}`);
  console.log(`  expired                : ${target.attributes.expired}`);
  console.log(`  usesNonExemptEncryption: ${target.attributes.usesNonExemptEncryption}`);

  // Beta detail
  console.log('\n--- buildBetaDetail (TestFlight processing/review state) ---');
  try {
    const bd = await api(jwt, `/v1/builds/${buildId}/buildBetaDetail`);
    const a = bd.data.attributes;
    console.log(`  internalBuildState: ${a.internalBuildState}`);
    console.log(`  externalBuildState: ${a.externalBuildState}`);
    console.log(`  autoNotifyEnabled : ${a.autoNotifyEnabled}`);
  } catch (e) {
    console.log(`  (no detail) ${(e as Error).message}`);
  }

  // Beta groups assigned
  console.log('\n--- betaGroups (who can install this build) ---');
  try {
    const bg = await api(jwt, `/v1/builds/${buildId}/betaGroups`);
    if (bg.data.length === 0) {
      console.log('  >>> NONE. No tester group can see this build. <<<');
      console.log('      Fix: in App Store Connect -> TestFlight -> Internal Testing,');
      console.log('      add the build to an internal group, then add your Apple ID');
      console.log('      (eftn87@gmail.com) as a tester. Or use the ASC API to do it.');
    } else {
      for (const g of bg.data) {
        console.log(`  group: ${g.id}`);
      }
    }
  } catch (e) {
    console.log(`  (error) ${(e as Error).message}`);
  }

  // Beta App Localizations (What to Test description)
  console.log('\n--- betaBuildLocalizations (What to Test) ---');
  try {
    const loc = await api(jwt, `/v1/builds/${buildId}/betaBuildLocalizations`);
    if (loc.data.length === 0) {
      console.log('  >>> NONE. No "What to Test" copy set. <<<');
    } else {
      for (const l of loc.data) {
        console.log(`  ${l.attributes.locale}: whatsNew="${(l.attributes.whatsNew || '').slice(0, 80)}"`);
      }
    }
  } catch (e) {
    console.log(`  (error) ${(e as Error).message}`);
  }

  // Beta App Review submission state
  console.log('\n--- betaAppReviewSubmission (external review) ---');
  try {
    const review = await api(jwt, `/v1/builds/${buildId}/betaAppReviewSubmission`);
    console.log(`  state: ${review.data?.attributes?.betaReviewState ?? '(none)'}`);
  } catch (e) {
    console.log(`  (no submission) ${(e as Error).message.slice(0, 150)}`);
  }

  // App-level beta groups
  console.log('\n--- App-level betaGroups (groups that exist for this app) ---');
  try {
    const groups = await api(jwt, `/v1/apps/${ASC_APP_ID}/betaGroups`);
    if (groups.data.length === 0) {
      console.log('  >>> NO BETA GROUPS EXIST for this app. <<<');
      console.log('      No internal tester group has been created yet, so');
      console.log('      no one can install ANY build. This is the most likely');
      console.log('      cause of "Something went wrong" in the TestFlight app.');
    } else {
      for (const g of groups.data) {
        const a = g.attributes;
        console.log(`  group "${a.name}" (id ${g.id})`);
        console.log(`     isInternalGroup     : ${a.isInternalGroup}`);
        console.log(`     hasAccessToAllBuilds: ${a.hasAccessToAllBuilds}`);
        console.log(`     publicLinkEnabled   : ${a.publicLinkEnabled}`);
        console.log(`     publicLink          : ${a.publicLink ?? '(none)'}`);
      }
    }
  } catch (e) {
    console.log(`  (error) ${(e as Error).message}`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});


// Add at the end of main() - second pass to also list testers
async function listTesters(jwt: string) {
  console.log('\n--- betaTesters in "Team (Expo)" group ---');
  // Find the group id again from app-level groups
  const groups = await api(jwt, `/v1/apps/${ASC_APP_ID}/betaGroups`);
  for (const g of groups.data ?? []) {
    if (!g.attributes.isInternalGroup) continue;
    console.log(`Group "${g.attributes.name}" (${g.id}):`);
    try {
      const testers = await api(jwt, `/v1/betaGroups/${g.id}/betaTesters`);
      if ((testers.data ?? []).length === 0) {
        console.log('  >>> NO TESTERS in this group. <<<');
        console.log('      Anyone who tries to open the app from TestFlight will see');
        console.log('      "Something went wrong" because they are not authorized.');
        console.log('      Fix: in App Store Connect, add eftn87@gmail.com as an');
        console.log('      internal tester here.');
      } else {
        for (const t of testers.data) {
          const a = t.attributes;
          console.log(`  ${a.firstName ?? ''} ${a.lastName ?? ''} <${a.email}> state=${a.state ?? '-'}`);
        }
      }
    } catch (e) {
      console.log(`  (error) ${(e as Error).message.slice(0, 200)}`);
    }
  }
}

// Re-run main with extra step
(async () => {
  const creds = parseAscSecret(getRawAscSecret());
  const jwt = signAscJwt(creds.keyId, creds.issuerId, creds.apiKey);
  await listTesters(jwt);
})();

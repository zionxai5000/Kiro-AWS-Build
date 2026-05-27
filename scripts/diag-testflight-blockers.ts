/**
 * "Something went wrong, we hit an unexpected error" in TestFlight is almost
 * never a runtime crash — it's TestFlight's server refusing to install the
 * build because something at the APP level (not the build level) is missing.
 *
 * The mandatory gates:
 *   1. betaAppReviewDetail (feedback email, contact info, demo creds)
 *   2. betaAppLocalizations (per-locale: feedback email, marketing URL,
 *      privacy policy URL, description)
 *   3. betaLicenseAgreement
 *   4. App icon registered to the build (we already verified)
 *   5. Build assigned to a beta group (we verified Team Expo has
 *      hasAccessToAllBuilds:true)
 *
 * If ANY of items 1-3 are unset, the TestFlight client throws the generic
 * "Something went wrong" instead of a useful message. This script enumerates
 * each gate and tells us exactly which one is failing so we can fix it.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { signAscJwt } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-jwt.js';
import { parseAscSecret } from '../packages/app/src/zionx/app-development/utils/parse-asc-secret.js';

const BASE = 'https://api.appstoreconnect.apple.com';
const APP_ID = '6773520429';
const BUILD_ID = '6d17c6cd-add1-44a3-b460-7f84053ea696';

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

async function api(jwt: string, path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json' },
  });
  let body: any = null;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { status: res.status, body };
}

function header(label: string) {
  console.log('\n' + '='.repeat(70));
  console.log(label);
  console.log('='.repeat(70));
}

async function main() {
  const creds = parseAscSecret(getRawAscSecret());
  const jwt = signAscJwt(creds.keyId, creds.issuerId, creds.apiKey);

  let blockers: string[] = [];

  // 1. App-level beta review detail
  header('1. APP BETA REVIEW DETAIL (feedback email, contact info)');
  const detail = await api(jwt, `/v1/apps/${APP_ID}/betaAppReviewDetail`);
  if (detail.status === 200) {
    const d = detail.body?.data?.attributes ?? {};
    console.log(`  contactFirstName: ${d.contactFirstName ?? '(missing)'}`);
    console.log(`  contactLastName : ${d.contactLastName  ?? '(missing)'}`);
    console.log(`  contactEmail    : ${d.contactEmail     ?? '(missing)'}`);
    console.log(`  contactPhone    : ${d.contactPhone     ?? '(missing)'}`);
    console.log(`  demoAccountName : ${d.demoAccountName  ?? '(none)'}`);
    console.log(`  demoAccountReqd : ${d.demoAccountRequired ?? false}`);
    console.log(`  notes           : ${(d.notes ?? '').slice(0, 80)}`);
    if (!d.contactEmail || !d.contactFirstName) blockers.push('betaAppReviewDetail: contact info missing');
  } else {
    console.log(`  HTTP ${detail.status}: ${JSON.stringify(detail.body).slice(0, 200)}`);
    blockers.push(`betaAppReviewDetail HTTP ${detail.status}`);
  }

  // 2. App-level beta localizations
  header('2. APP BETA LOCALIZATIONS (privacy URL, marketing URL, description)');
  const locs = await api(jwt, `/v1/apps/${APP_ID}/betaAppLocalizations`);
  if (locs.status === 200) {
    const list = locs.body?.data ?? [];
    if (list.length === 0) {
      console.log('  >>> NONE. <<<');
      blockers.push('betaAppLocalizations: no locales set');
    } else {
      for (const l of list) {
        const a = l.attributes ?? {};
        console.log(`  locale=${a.locale}`);
        console.log(`     feedbackEmail   : ${a.feedbackEmail   ?? '(missing)'}`);
        console.log(`     marketingUrl    : ${a.marketingUrl    ?? '(missing)'}`);
        console.log(`     privacyPolicyUrl: ${a.privacyPolicyUrl ?? '(missing)'}`);
        console.log(`     tvOsPrivacyPolicy: ${a.tvOsPrivacyPolicy ?? '-'}`);
        console.log(`     description     : ${(a.description ?? '').slice(0, 80)}`);
        if (!a.feedbackEmail) blockers.push(`${a.locale}: feedbackEmail missing`);
        if (!a.privacyPolicyUrl) blockers.push(`${a.locale}: privacyPolicyUrl missing`);
        if (!a.description) blockers.push(`${a.locale}: description missing`);
      }
    }
  } else {
    console.log(`  HTTP ${locs.status}: ${JSON.stringify(locs.body).slice(0, 200)}`);
    blockers.push(`betaAppLocalizations HTTP ${locs.status}`);
  }

  // 3. Beta license agreement
  header('3. BETA LICENSE AGREEMENT');
  const lic = await api(jwt, `/v1/apps/${APP_ID}/betaLicenseAgreement`);
  if (lic.status === 200) {
    const l = lic.body?.data?.attributes ?? {};
    console.log(`  agreementText: ${(l.agreementText ?? '(default)').slice(0, 100)}`);
  } else {
    console.log(`  HTTP ${lic.status}`);
  }

  // 4. Confirm internal beta group still includes the user
  header('4. INTERNAL BETA GROUP MEMBERSHIP');
  const groups = await api(jwt, `/v1/apps/${APP_ID}/betaGroups`);
  for (const g of groups.body?.data ?? []) {
    if (!g.attributes?.isInternalGroup) continue;
    console.log(`  Group "${g.attributes.name}" (${g.id})`);
    const testers = await api(jwt, `/v1/betaGroups/${g.id}/betaTesters`);
    for (const t of testers.body?.data ?? []) {
      const ta = t.attributes ?? {};
      console.log(`    ${ta.email}: state=${ta.state}, inviteType=${ta.inviteType}`);
    }
  }

  // 5. Confirm Build #20 is reachable through the group
  header('5. BUILD #20 BETA GROUP ASSIGNMENT');
  const buildGroups = await api(jwt, `/v1/builds/${BUILD_ID}/relationships/betaGroups`);
  console.log(`  HTTP ${buildGroups.status}`);
  if (buildGroups.status === 200) {
    const bgList = buildGroups.body?.data ?? [];
    if (bgList.length === 0) {
      console.log('  >>> NO BETA GROUPS ASSIGNED. Build is not installable. <<<');
      blockers.push('Build #20 has no betaGroups assigned');
    } else {
      for (const bg of bgList) console.log(`  group id=${bg.id}`);
    }
  } else {
    console.log(`  ${JSON.stringify(buildGroups.body).slice(0, 200)}`);
  }

  // 6. App Privacy / age rating — TestFlight requires these for install
  header('6. APP INFO (age rating, content rights)');
  const appInfo = await api(jwt, `/v1/apps/${APP_ID}/appInfos`);
  if (appInfo.status === 200) {
    for (const ai of appInfo.body?.data ?? []) {
      const aia = ai.attributes ?? {};
      console.log(`  state                   : ${aia.appStoreState ?? aia.state ?? '?'}`);
      console.log(`  appStoreAgeRating       : ${aia.appStoreAgeRating ?? '(unset)'}`);
      console.log(`  brazilAgeRating         : ${aia.brazilAgeRating ?? '-'}`);
      console.log(`  primaryCategory         : ${aia.primaryCategory ?? '(unset)'}`);
      console.log(`  kidsAgeBand             : ${aia.kidsAgeBand ?? '-'}`);
      if (!aia.appStoreAgeRating) blockers.push('age rating not set');
    }
  } else {
    console.log(`  HTTP ${appInfo.status}`);
  }

  // 7. App icons on the build
  header('7. BUILD ICONS');
  const icons = await api(jwt, `/v1/builds/${BUILD_ID}/icons`);
  if (icons.status === 200) {
    const list = icons.body?.data ?? [];
    console.log(`  ${list.length} icon entries`);
    for (const ic of list) {
      const ia = ic.attributes ?? {};
      console.log(`   - templateUrl: ${ia.templateUrl ? 'present' : 'MISSING'}`);
    }
    if (list.length === 0) blockers.push('build has no app icon');
  }

  header('SUMMARY');
  if (blockers.length === 0) {
    console.log('  No blocking gates found via ASC API.');
    console.log('  TestFlight error must be transient or client-side cache.');
  } else {
    console.log(`  ${blockers.length} blocker(s) found:`);
    for (const b of blockers) console.log(`   - ${b}`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

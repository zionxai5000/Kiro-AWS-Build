/**
 * Pull every error/diagnostic signal Apple has for Build #20.
 *
 * Surfaces:
 *  - Build processingState + processing errors (binary-level rejections)
 *  - buildBetaDetail (TestFlight-side state, autoNotifyEnabled)
 *  - betaAppReviewSubmission (external review failures)
 *  - diagnosticSignatures (Apple's signed messages about issues with the binary)
 *  - perfPowerMetrics (App Store Connect performance/power telemetry, when present)
 *  - betaTesterUsages (whether anyone has actually opened the build)
 *
 * Crash logs from devices DO NOT come back through ASC — those live in:
 *    - Sentry (runtime, requires the app to ship with @sentry/react-native
 *      initialized — only future builds will have this; #20 was generated
 *      before Sentry was added to the system prompt).
 *    - Xcode Organizer (manual export by the developer).
 *    - TestFlight feedback (only when a tester taps "Send Feedback").
 *
 * What we CAN see is whether Apple's processing layer flagged anything,
 * and whether any tester has installed/opened the build yet.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { signAscJwt } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-jwt.js';
import { parseAscSecret } from '../packages/app/src/zionx/app-development/utils/parse-asc-secret.js';

const BASE = 'https://api.appstoreconnect.apple.com';
const BUILD_ID = '6d17c6cd-add1-44a3-b460-7f84053ea696'; // Build #20

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

  // 1. Build resource — top-level processing state
  header('1. BUILD RESOURCE — top-level processing state');
  const build = await api(jwt, `/v1/builds/${BUILD_ID}`);
  const a = build.body?.data?.attributes ?? {};
  console.log(`  processingState        : ${a.processingState}`);
  console.log(`  uploadedDate           : ${a.uploadedDate}`);
  console.log(`  expirationDate         : ${a.expirationDate}`);
  console.log(`  expired                : ${a.expired}`);
  console.log(`  usesNonExemptEncryption: ${a.usesNonExemptEncryption}`);
  console.log(`  minOsVersion           : ${a.minOsVersion}`);
  console.log(`  iconAssetToken         : ${a.iconAssetToken ? '(present)' : '(none)'}`);
  console.log(`  buildAudienceType      : ${a.buildAudienceType}`);
  console.log(`  computedMinMacOsVersion: ${a.computedMinMacOsVersion}`);
  console.log(`  lsMinimumSystemVersion : ${a.lsMinimumSystemVersion}`);

  // 2. Build beta detail — TestFlight-side processing
  header('2. BETA DETAIL — TestFlight-side processing/review state');
  const beta = await api(jwt, `/v1/builds/${BUILD_ID}/buildBetaDetail`);
  if (beta.status === 200) {
    const b = beta.body?.data?.attributes ?? {};
    console.log(`  internalBuildState : ${b.internalBuildState}`);
    console.log(`  externalBuildState : ${b.externalBuildState}`);
    console.log(`  autoNotifyEnabled  : ${b.autoNotifyEnabled}`);
  } else {
    console.log(`  HTTP ${beta.status}: no buildBetaDetail`);
  }

  // 3. Diagnostic signatures — Apple's signed warnings about the binary
  header('3. DIAGNOSTIC SIGNATURES — Apple-flagged binary issues');
  const diag = await api(jwt, `/v1/builds/${BUILD_ID}/diagnosticSignatures`);
  if (diag.status === 200) {
    const list = diag.body?.data ?? [];
    if (list.length === 0) {
      console.log('  >>> NONE. Apple has not flagged any binary-level issues. <<<');
    } else {
      console.log(`  Found ${list.length} diagnostic signature(s):`);
      for (const d of list) {
        const da = d.attributes ?? {};
        console.log(`   - ${da.diagnosticType ?? '?'}: ${da.signature ?? ''}`);
        console.log(`     weight=${da.weight ?? '?'}, profile=${da.profile ?? '?'}`);
      }
    }
  } else {
    console.log(`  HTTP ${diag.status}: ${typeof diag.body === 'string' ? diag.body.slice(0, 200) : JSON.stringify(diag.body).slice(0, 200)}`);
  }

  // 4. Beta app review submission
  header('4. BETA APP REVIEW SUBMISSION — external review state');
  const rev = await api(jwt, `/v1/builds/${BUILD_ID}/betaAppReviewSubmission`);
  if (rev.status === 200) {
    const r = rev.body?.data?.attributes ?? {};
    console.log(`  betaReviewState: ${r.betaReviewState ?? '(none submitted)'}`);
    if (r.submittedDate) console.log(`  submittedDate  : ${r.submittedDate}`);
  } else {
    console.log(`  HTTP ${rev.status} — no external review submission`);
  }

  // 5. Beta build localizations (What to Test)
  header('5. WHAT TO TEST (betaBuildLocalizations)');
  const loc = await api(jwt, `/v1/builds/${BUILD_ID}/betaBuildLocalizations`);
  const locs = loc.body?.data ?? [];
  if (locs.length === 0) {
    console.log('  (none)');
  } else {
    for (const l of locs) {
      const la = l.attributes ?? {};
      console.log(`  ${la.locale}: "${(la.whatsNew ?? '').slice(0, 200)}"`);
    }
  }

  // 6. App icons / asset processing
  header('6. APP ICON / ASSET PROCESSING');
  const icons = await api(jwt, `/v1/builds/${BUILD_ID}/icons`);
  console.log(`  HTTP ${icons.status}, ${icons.body?.data?.length ?? 0} icon entries`);

  // 7. Perf power metrics (mostly empty until users run the build)
  header('7. PERF POWER METRICS (energy/performance telemetry)');
  const perf = await api(jwt, `/v1/builds/${BUILD_ID}/perfPowerMetrics`);
  if (perf.status === 200) {
    const list = perf.body?.data ?? [];
    if (list.length === 0) {
      console.log('  (none — no devices have generated perf data yet)');
    } else {
      console.log(`  Found ${list.length} perf entries`);
      for (const p of list.slice(0, 5)) {
        const pa = p.attributes ?? {};
        console.log(`   - ${pa.metricCategory}/${pa.metricType}: ${pa.platform}, dataPoints=${(pa.dataPoints ?? []).length}`);
      }
    }
  } else {
    console.log(`  HTTP ${perf.status}: ${typeof perf.body === 'string' ? perf.body.slice(0, 200) : JSON.stringify(perf.body).slice(0, 200)}`);
  }

  // 8. Beta tester usages — has anyone actually opened the build?
  header('8. BETA TESTER USAGES — install/launch activity');
  // ASC API does not expose per-tester usage directly via /builds.
  // Closest signal is /v1/builds/{id}/individualTesters and the tester's state.
  const testers = await api(jwt, `/v1/builds/${BUILD_ID}/individualTesters`);
  if (testers.status === 200) {
    const list = testers.body?.data ?? [];
    if (list.length === 0) {
      console.log('  (none — no individual testers attached to this build directly)');
    } else {
      for (const t of list) {
        const ta = t.attributes ?? {};
        console.log(`  ${ta.firstName ?? ''} ${ta.lastName ?? ''} <${ta.email}> state=${ta.state ?? '-'}`);
      }
    }
  } else {
    console.log(`  HTTP ${testers.status}`);
  }

  header('SUMMARY');
  console.log(`  Apple processing : ${a.processingState}`);
  console.log(`  Internal state   : ${beta.body?.data?.attributes?.internalBuildState ?? '-'}`);
  console.log(`  External state   : ${beta.body?.data?.attributes?.externalBuildState ?? '-'}`);
  console.log(`  Diagnostic flags : ${diag.body?.data?.length ?? 0}`);
  console.log(`  External review  : ${rev.body?.data?.attributes?.betaReviewState ?? '(not submitted)'}`);
  console.log(`  WhatsToTest set  : ${locs.length > 0 ? 'yes' : 'NO'}`);
  console.log('');
  console.log('NOTE: Runtime/device crash logs require Sentry to be initialized');
  console.log('inside the app. Build #20 was generated before Sentry was added');
  console.log('to the system prompt — the next generated app will surface those.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

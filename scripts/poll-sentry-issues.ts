/**
 * Poll Sentry for issues from the mindful-timer project.
 *
 * Runs continuously, prints any new issue with full stack trace and
 * device context. Use this in a separate terminal while the user
 * tries to install/run Build #22.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const SENTRY_BASE = 'https://sentry.io/api/0';

function getSentrySecret() {
  const scriptPath = join(process.cwd(), 'scripts', '_get-sentry-temp.ps1');
  writeFileSync(scriptPath, `$r = aws secretsmanager get-secret-value --secret-id "seraphim/sentry" --region us-east-1 --output json | ConvertFrom-Json\nWrite-Output $r.SecretString\n`, 'utf-8');
  try {
    const raw = execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(raw.trim());
  } finally { try { unlinkSync(scriptPath); } catch { } }
}

async function api(token: string, path: string) {
  const res = await fetch(`${SENTRY_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

const seenIssues = new Set<string>();

async function pollOnce(token: string, org: string, project: string) {
  const issues = await api(token, `/projects/${org}/${project}/issues/?statsPeriod=1h&sort=date`);
  if (issues.status !== 200) {
    console.log(`Sentry API error: ${issues.status} ${JSON.stringify(issues.body).slice(0, 200)}`);
    return;
  }
  for (const issue of issues.body ?? []) {
    if (seenIssues.has(issue.id)) continue;
    seenIssues.add(issue.id);
    console.log('\n' + '='.repeat(70));
    console.log(`NEW ISSUE: ${issue.title}`);
    console.log(`  shortId: ${issue.shortId}`);
    console.log(`  count  : ${issue.count}, users: ${issue.userCount ?? 0}`);
    console.log(`  level  : ${issue.level}, type: ${issue.type}`);
    console.log(`  first  : ${issue.firstSeen}`);
    console.log(`  last   : ${issue.lastSeen}`);
    console.log(`  url    : ${issue.permalink}`);
    console.log('  --- metadata ---');
    console.log(`  ${JSON.stringify(issue.metadata).slice(0, 300)}`);

    // Pull the most recent event for full stack
    const events = await api(token, `/issues/${issue.id}/events/?full=1`);
    const ev = events.body?.[0];
    if (ev) {
      console.log('  --- latest event ---');
      console.log(`  eventID  : ${ev.eventID}`);
      console.log(`  platform : ${ev.platform}`);
      console.log(`  release  : ${ev.release ?? '(none)'}`);
      console.log(`  message  : ${ev.message ?? '(none)'}`);
      const tags = ev.tags ?? [];
      const tagMap: Record<string, string> = {};
      for (const t of tags) tagMap[t.key] = t.value;
      console.log(`  os       : ${tagMap.os ?? tagMap.osName ?? '?'} ${tagMap.osVersion ?? ''}`);
      console.log(`  device   : ${tagMap.device ?? '?'} (${tagMap.deviceFamily ?? '?'})`);

      // Extract the exception entry
      const entries = ev.entries ?? [];
      const excEntry = entries.find((e: any) => e.type === 'exception');
      if (excEntry) {
        for (const exc of excEntry.data?.values ?? []) {
          console.log(`\n  EXCEPTION: ${exc.type}: ${exc.value}`);
          const frames = exc.stacktrace?.frames ?? [];
          // Reverse to show most recent frame first (Sentry stores oldest first)
          for (const f of frames.slice(-15).reverse()) {
            const fn = f.function ?? '<anon>';
            const file = f.filename ?? f.module ?? '?';
            const line = f.lineNo ?? '?';
            const inApp = f.inApp ? '*' : ' ';
            console.log(`    ${inApp} ${fn} (${file}:${line})`);
          }
        }
      }
    }
    console.log('=' .repeat(70));
  }
}

async function main() {
  const sec = getSentrySecret();
  const org = sec.org;
  const project = sec.project || 'mindful-timer';
  console.log(`Polling Sentry org=${org}, project=${project} every 15s. Ctrl+C to stop.`);
  console.log(`(Watching for issues from now onward — first run seeds the seen-set.)\n`);

  // Seed seen set with current issues
  await pollOnce(sec.authToken, org, project);
  // After seeding, clear seen so we report ALL new ones
  // Actually keep them so we only show truly new ones.

  while (true) {
    await new Promise((r) => setTimeout(r, 15_000));
    await pollOnce(sec.authToken, org, project);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

/**
 * Server-side fixes for "Something went wrong" persisting on Build #20:
 *
 *   A. Explicitly POST the build into the Team (Expo) beta group.
 *      Even with hasAccessToAllBuilds:true, TestFlight expects the build
 *      to be in the betaGroups relationship of the build resource.
 *
 *   B. Re-send the TestFlight invite to eftn87@gmail.com.
 *      If the previous invite was for an older (crashed) build,
 *      TestFlight may still be holding that stale association.
 *
 *   C. Pull the public TestFlight invite URL so the user can install
 *      via the link directly (bypasses cached invite state).
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { signAscJwt } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-jwt.js';
import { parseAscSecret } from '../packages/app/src/zionx/app-development/utils/parse-asc-secret.js';

const BASE = 'https://api.appstoreconnect.apple.com';
const APP_ID = '6773520429';
const BUILD_ID = '6d17c6cd-add1-44a3-b460-7f84053ea696'; // ASC id for Build #20
const TESTER_EMAIL = 'eftn87@gmail.com';

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

async function api(jwt: string, method: string, path: string, body?: any) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    Accept: 'application/json',
  };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let respBody: any = null;
  try { respBody = await res.json(); } catch { respBody = await res.text(); }
  return { status: res.status, body: respBody };
}

function header(label: string) {
  console.log('\n' + '='.repeat(70));
  console.log(label);
  console.log('='.repeat(70));
}

async function main() {
  const creds = parseAscSecret(getRawAscSecret());
  const jwt = signAscJwt(creds.keyId, creds.issuerId, creds.apiKey);

  // Find the Team (Expo) internal group
  const groups = await api(jwt, 'GET', `/v1/apps/${APP_ID}/betaGroups`);
  const teamGroup = (groups.body?.data ?? []).find((g: any) => g.attributes?.isInternalGroup);
  if (!teamGroup) {
    console.log('No internal beta group found.');
    process.exit(1);
  }
  const groupId = teamGroup.id;
  console.log(`Internal group: ${teamGroup.attributes.name} (${groupId})`);

  // ---------- A. Force-assign Build #20 to that group ----------
  header('A. POST /v1/betaGroups/:id/relationships/builds');
  const assign = await api(jwt, 'POST', `/v1/betaGroups/${groupId}/relationships/builds`, {
    data: [{ type: 'builds', id: BUILD_ID }],
  });
  console.log(`  status: ${assign.status}`);
  if (assign.status >= 400) {
    console.log(`  body: ${JSON.stringify(assign.body).slice(0, 400)}`);
  } else {
    console.log('  Build #20 explicitly added to Team (Expo).');
  }

  // ---------- B. Find the tester record ----------
  header('B. Find tester record');
  const testers = await api(jwt, 'GET', `/v1/betaGroups/${groupId}/betaTesters`);
  const me = (testers.body?.data ?? []).find((t: any) => t.attributes?.email === TESTER_EMAIL);
  if (!me) {
    console.log(`Tester ${TESTER_EMAIL} not in group — adding`);
    const add = await api(jwt, 'POST', '/v1/betaTesters', {
      data: {
        type: 'betaTesters',
        attributes: { email: TESTER_EMAIL, firstName: 'Eneka', lastName: 'Fateen' },
        relationships: {
          betaGroups: { data: [{ type: 'betaGroups', id: groupId }] },
          apps: { data: [{ type: 'apps', id: APP_ID }] },
        },
      },
    });
    console.log(`  add status: ${add.status}`);
    if (add.status >= 400) console.log(`  body: ${JSON.stringify(add.body).slice(0, 400)}`);
  } else {
    console.log(`  tester id=${me.id}, state=${me.attributes?.state}, inviteType=${me.attributes?.inviteType}`);

    // ---------- B2. Re-send invite ----------
    header('B2. Re-send invite');
    const resend = await api(jwt, 'POST', '/v1/betaTesterInvitations', {
      data: {
        type: 'betaTesterInvitations',
        relationships: {
          app: { data: { type: 'apps', id: APP_ID } },
          betaTester: { data: { type: 'betaTesters', id: me.id } },
        },
      },
    });
    console.log(`  invite status: ${resend.status}`);
    if (resend.status >= 400) {
      console.log(`  body: ${JSON.stringify(resend.body).slice(0, 400)}`);
    } else {
      console.log('  Invite email re-sent. Check your inbox.');
    }
  }

  // ---------- C. Public invite link ----------
  header('C. Public invite link (bypasses cached state)');
  const refreshGroup = await api(jwt, 'GET', `/v1/betaGroups/${groupId}`);
  const linkAttrs = refreshGroup.body?.data?.attributes ?? {};
  console.log(`  publicLinkEnabled  : ${linkAttrs.publicLinkEnabled}`);
  console.log(`  publicLink         : ${linkAttrs.publicLink ?? '(none)'}`);
  console.log(`  publicLinkLimit    : ${linkAttrs.publicLinkLimit}`);

  if (linkAttrs.publicLinkEnabled !== true) {
    console.log('\n  Enabling public link…');
    const patch = await api(jwt, 'PATCH', `/v1/betaGroups/${groupId}`, {
      data: {
        type: 'betaGroups',
        id: groupId,
        attributes: { publicLinkEnabled: true, publicLinkLimitEnabled: false },
      },
    });
    console.log(`  patch status: ${patch.status}`);
    if (patch.status >= 400) {
      console.log(`  body: ${JSON.stringify(patch.body).slice(0, 400)}`);
    } else {
      const after = await api(jwt, 'GET', `/v1/betaGroups/${groupId}`);
      console.log(`  publicLink (now): ${after.body?.data?.attributes?.publicLink ?? '(still empty — Apple takes a moment)'}`);
    }
  }

  // ---------- D. Verify build is now visible to the group ----------
  header('D. Re-verify build assignment');
  // Use /v1/builds with filter for the group's perspective
  const verify = await api(jwt, 'GET', `/v1/betaGroups/${groupId}/builds`);
  console.log(`  status: ${verify.status}`);
  const list = verify.body?.data ?? [];
  console.log(`  ${list.length} build(s) attached to this group:`);
  for (const b of list.slice(0, 5)) {
    console.log(`   - build ${b.id} version=${b.attributes?.version}`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

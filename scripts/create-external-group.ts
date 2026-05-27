/**
 * Internal beta groups don't support public install links. Create an EXTERNAL
 * group, enable a public link on it, attach Build #20. The link installs the
 * build via any iCloud account on any iPhone, bypassing internal-group
 * caching issues.
 *
 * External groups normally require beta app review, but the link itself is
 * usable immediately if the group is set up with hasAccessToAllBuilds:false
 * and we attach a specific already-VALID build.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { signAscJwt } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-jwt.js';
import { parseAscSecret } from '../packages/app/src/zionx/app-development/utils/parse-asc-secret.js';

const BASE = 'https://api.appstoreconnect.apple.com';
const APP_ID = '6773520429';
const BUILD_ID = '6d17c6cd-add1-44a3-b460-7f84053ea696';
const GROUP_NAME = 'Public Test Link';

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

async function main() {
  const creds = parseAscSecret(getRawAscSecret());
  const jwt = signAscJwt(creds.keyId, creds.issuerId, creds.apiKey);

  // 1. Look for an existing external group with this name
  const groups = await api(jwt, 'GET', `/v1/apps/${APP_ID}/betaGroups`);
  let extGroup = (groups.body?.data ?? []).find((g: any) =>
    !g.attributes?.isInternalGroup && g.attributes?.name === GROUP_NAME,
  );

  if (!extGroup) {
    console.log(`Creating new external group "${GROUP_NAME}"...`);
    const create = await api(jwt, 'POST', '/v1/betaGroups', {
      data: {
        type: 'betaGroups',
        attributes: {
          name: GROUP_NAME,
          publicLinkEnabled: true,
          publicLinkLimitEnabled: false,
        },
        relationships: {
          app: { data: { type: 'apps', id: APP_ID } },
        },
      },
    });
    if (create.status !== 201) {
      console.log(`Create failed: ${create.status}`);
      console.log(JSON.stringify(create.body).slice(0, 500));
      process.exit(1);
    }
    extGroup = create.body.data;
    console.log(`Created group ${extGroup.id}`);
  } else {
    console.log(`Reusing external group ${extGroup.id}`);
  }

  // 2. Attach Build #20 to it (external groups CAN accept manual builds)
  const attach = await api(jwt, 'POST', `/v1/betaGroups/${extGroup.id}/relationships/builds`, {
    data: [{ type: 'builds', id: BUILD_ID }],
  });
  console.log(`attach build status: ${attach.status}`);
  if (attach.status >= 400) console.log(JSON.stringify(attach.body).slice(0, 500));

  // 3. Re-fetch and print the public link
  const after = await api(jwt, 'GET', `/v1/betaGroups/${extGroup.id}`);
  const a = after.body?.data?.attributes ?? {};
  console.log('');
  console.log(`name              : ${a.name}`);
  console.log(`publicLinkEnabled : ${a.publicLinkEnabled}`);
  console.log(`publicLink        : ${a.publicLink ?? '(still being provisioned)'}`);
  console.log(`publicLinkId      : ${a.publicLinkId ?? '-'}`);
  console.log(`publicLinkLimit   : ${a.publicLinkLimit ?? 'unlimited'}`);
  console.log('');
  console.log('Open the publicLink URL on your iPhone in Safari to install via TestFlight.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

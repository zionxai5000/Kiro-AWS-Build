/**
 * Set the age rating declaration. Without this, the App Info state stays
 * PREPARE_FOR_SUBMISSION and TestFlight refuses to install builds for users
 * who haven't already accepted the prior version.
 *
 * The declaration is a child resource of appInfos. We POST one if it doesn't
 * exist, PATCH if it does.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { signAscJwt } from '../packages/app/src/zionx/app-development/services/apple-credentials/asc-jwt.js';
import { parseAscSecret } from '../packages/app/src/zionx/app-development/utils/parse-asc-secret.js';

const BASE = 'https://api.appstoreconnect.apple.com';
const APP_ID = '6773520429';

// Cleanest declaration: NONE for everything (4+ rating).
// Field set verified against ASC API 2025+ schema.
const DECLARATION = {
  alcoholTobaccoOrDrugUseOrReferences: 'NONE',
  contests: 'NONE',
  gamblingSimulated: 'NONE',
  medicalOrTreatmentInformation: 'NONE',
  profanityOrCrudeHumor: 'NONE',
  sexualContentGraphicAndNudity: 'NONE',
  sexualContentOrNudity: 'NONE',
  horrorOrFearThemes: 'NONE',
  matureOrSuggestiveThemes: 'NONE',
  unrestrictedWebAccess: false,
  gambling: false,
  violenceCartoonOrFantasy: 'NONE',
  violenceRealistic: 'NONE',
  violenceRealisticProlongedGraphicOrSadistic: 'NONE',
  // 2025 schema additions (booleans = "does the app contain this?"):
  messagingAndChat: false,
  advertising: false,
  healthOrWellnessTopics: false,
  ageAssurance: false,
  userGeneratedContent: false,
  parentalControls: false,
  lootBox: false,
  // Still string enums:
  gunsOrOtherWeapons: 'NONE',
  kidsAgeBand: null,
};

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
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let respBody: any = null;
  try { respBody = await res.json(); } catch { respBody = await res.text(); }
  return { status: res.status, body: respBody };
}

async function main() {
  const creds = parseAscSecret(getRawAscSecret());
  const jwt = signAscJwt(creds.keyId, creds.issuerId, creds.apiKey);

  // 1. Find the appInfo resource (PREPARE_FOR_SUBMISSION state)
  const appInfos = await api(jwt, 'GET', `/v1/apps/${APP_ID}/appInfos`);
  const editable = (appInfos.body?.data ?? []).find(
    (ai: any) => ai.attributes?.appStoreState === 'PREPARE_FOR_SUBMISSION',
  );
  if (!editable) {
    console.log('No editable appInfo (PREPARE_FOR_SUBMISSION). Cannot patch age rating.');
    process.exit(1);
  }
  const appInfoId = editable.id;
  console.log(`Editable appInfo: ${appInfoId}`);

  // 2. Get existing declaration if any
  const existing = await api(jwt, 'GET', `/v1/appInfos/${appInfoId}/ageRatingDeclaration`);
  if (existing.status === 200 && existing.body?.data?.id) {
    const decId = existing.body.data.id;
    console.log(`Found existing declaration ${decId} — PATCHing`);
    const patch = await api(jwt, 'PATCH', `/v1/ageRatingDeclarations/${decId}`, {
      data: {
        type: 'ageRatingDeclarations',
        id: decId,
        attributes: DECLARATION,
      },
    });
    console.log(`PATCH status: ${patch.status}`);
    if (patch.status >= 400) {
      const errs = patch.body?.errors ?? [];
      console.log(`\nMissing/invalid fields:`);
      for (const e of errs) {
        const ptr = e.source?.pointer ?? e.source?.parameter ?? '?';
        console.log(`  ${e.code}: ${ptr.replace('/data/attributes/', '')} -- ${e.detail}`);
      }
    }
  } else {
    console.log(`No declaration (HTTP ${existing.status}) — POSTing`);
    const post = await api(jwt, 'POST', '/v1/ageRatingDeclarations', {
      data: {
        type: 'ageRatingDeclarations',
        attributes: DECLARATION,
        relationships: {
          appInfo: { data: { type: 'appInfos', id: appInfoId } },
        },
      },
    });
    console.log(`POST status: ${post.status}`);
    if (post.status >= 400) console.log(`body: ${JSON.stringify(post.body).slice(0, 500)}`);
  }

  // 3. Re-fetch appInfos to confirm rating now appears
  const after = await api(jwt, 'GET', `/v1/apps/${APP_ID}/appInfos`);
  for (const ai of after.body?.data ?? []) {
    console.log(`  appInfo ${ai.id}: state=${ai.attributes?.appStoreState}, ageRating=${ai.attributes?.appStoreAgeRating ?? '(unset)'}`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

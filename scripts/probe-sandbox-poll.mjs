/**
 * Poll GET /sandbox on the saved 5-Star project until phase=ready or timeout.
 * Mirrors what the dashboard does after a successful 202 wake.
 */
import { readFile } from 'node:fs/promises';

const PW = (await readFile('.probe-pw', 'utf-8')).trim();
const auth = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
  },
  body: JSON.stringify({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: '77p41spm5d420kdg6ut9c6f4u1',
    AuthParameters: { USERNAME: 'king', PASSWORD: PW },
  }),
});
const tok = (await auth.json()).AuthenticationResult.IdToken;
const ALB = 'http://seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com';
const PROJECT = process.argv[2] || 'proj-1781063000651-58ed63b6';

const MAX = 120; // 120 * 5s = 10 min
let lastPhase = '';
for (let i = 0; i < MAX; i++) {
  const r = await fetch(`${ALB}/api/app-dev/projects/${PROJECT}/sandbox`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  const body = await r.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.log(`[${i.toString().padStart(3, '0')}] HTTP ${r.status} (non-JSON):`, body.slice(0, 200));
    await new Promise((res) => setTimeout(res, 5000));
    continue;
  }
  const phase = parsed.phase || parsed.status || 'unknown';
  if (phase !== lastPhase) {
    console.log(
      `[${i.toString().padStart(3, '0')}] phase=${phase} status=${parsed.status} url=${parsed.previewUrl || '-'} err=${parsed.error || '-'}`
    );
    if (parsed.message) console.log('       msg:', parsed.message);
    lastPhase = phase;
  } else {
    process.stdout.write('.');
  }
  if (phase === 'ready' || parsed.status === 'live' || parsed.previewUrl) {
    console.log('\n✅ READY');
    console.log(JSON.stringify(parsed, null, 2));
    process.exit(0);
  }
  if (phase === 'error' || parsed.status === 'error') {
    console.log('\n❌ ERROR');
    console.log(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }
  await new Promise((res) => setTimeout(res, 5000));
}
console.log('\n⏱️  Timeout after 10 minutes');
process.exit(2);

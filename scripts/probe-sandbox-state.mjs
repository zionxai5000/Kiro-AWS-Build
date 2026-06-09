/**
 * Hit the sandbox-status endpoint + the preview proxy to see exactly what
 * the sandbox + Metro server is doing.
 */
import { readFile } from 'node:fs/promises';

const COGNITO_REGION = 'us-east-1';
const CLIENT_ID = '77p41spm5d420kdg6ut9c6f4u1';
const ALB = 'http://seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com';
const PROJECT = 'proj-1781030772907-72bc18c2';
const PW = (await readFile('.probe-pw', 'utf-8')).trim();

const auth = await fetch(`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
  body: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: CLIENT_ID, AuthParameters: { USERNAME: 'king', PASSWORD: PW } }),
});
const tok = (await auth.json()).AuthenticationResult;
const headers = { Authorization: `Bearer ${tok.IdToken}` };

console.log('--- sandbox status ---');
const r1 = await fetch(`${ALB}/api/app-dev/projects/${PROJECT}/sandbox`, { headers });
console.log('HTTP', r1.status);
console.log(await r1.text());

console.log('\n--- preview proxy ---');
const r2 = await fetch(`${ALB}/api/preview/${PROJECT}`, { headers, redirect: 'manual' });
console.log('HTTP', r2.status);
const body = await r2.text();
console.log(body.slice(0, 600));

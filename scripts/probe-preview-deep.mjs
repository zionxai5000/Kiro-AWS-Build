/**
 * Deep probe of the auth-proxied preview URL.
 * Captures every network request/response so we can see exactly what's 404-ing.
 */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const PW = (await readFile('.probe-pw', 'utf-8')).trim();
const auth = await fetch('https://cognito-idp.us-east-1.amazonaws.com/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
  body: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: '77p41spm5d420kdg6ut9c6f4u1', AuthParameters: { USERNAME: 'king' , PASSWORD: PW } }),
});
const tok = (await auth.json()).AuthenticationResult.IdToken;
const ALB = 'http://seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com';
const PROJECT = process.argv[2] || 'proj-1781063000651-58ed63b6';

const r = await fetch(`${ALB}/api/preview/${PROJECT}/token`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${tok}` },
  body: '{}',
});
const tokenBody = await r.json();
const proxyUrl = `${ALB}${tokenBody.urlPattern}`;
console.log('proxy url:', proxyUrl);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
const page = await ctx.newPage();
const requests = [];
const responses = [];
const errors = [];
const consoleMsgs = [];

page.on('request', (req) => {
  if (req.url().includes('e2b.app') || req.url().includes('elb.amazonaws.com') || req.url().includes('preview')) {
    requests.push(`${req.method()} ${req.url()}`);
  }
});
page.on('response', (res) => {
  if (res.url().includes('e2b.app') || res.url().includes('elb.amazonaws.com') || res.url().includes('preview')) {
    responses.push(`${res.status()} ${res.url()}`);
  }
});
page.on('pageerror', (e) => errors.push(`PAGE: ${e.message.slice(0, 400)}`));
page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));

try { await page.goto(proxyUrl, { timeout: 30_000, waitUntil: 'networkidle' }); } catch (e) { console.warn('goto:', e.message); }
await page.waitForTimeout(8000);

console.log('\n=== Requests ===');
requests.forEach((r) => console.log('  ', r));
console.log('\n=== Responses ===');
responses.forEach((r) => console.log('  ', r));
console.log('\n=== Page errors ===');
errors.forEach((e) => console.log('  ', e));
console.log('\n=== Console (last 15) ===');
consoleMsgs.slice(-15).forEach((m) => console.log('  ', m));

const root = await page.evaluate(() => {
  const r = document.querySelector('#root');
  return {
    exists: !!r,
    childCount: r?.children.length ?? 0,
    bodyText: document.body.innerText.slice(0, 400),
  };
});
console.log('\n=== Render ===');
console.log('  root exists:', root.exists);
console.log('  root.children:', root.childCount);
console.log('  body text:', JSON.stringify(root.bodyText));

await page.screenshot({ path: 'scripts/preview-deep.png', fullPage: true });
console.log('\nscreenshot: scripts/preview-deep.png');
await browser.close();

/**
 * Open the tic-tac-toe project in the live harness, drive the preview to
 * the running app, and capture a screenshot of the rendered game.
 */
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DASH = 'http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com';
const COGNITO_REGION = 'us-east-1';
const CLIENT_ID = '77p41spm5d420kdg6ut9c6f4u1';
const PROJECT = 'proj-1781030772907-72bc18c2';
const PW = (await readFile('.probe-pw', 'utf-8')).trim();
const OUT = join(process.cwd(), 'scripts', 'tictactoe-output');
await mkdir(OUT, { recursive: true });

console.log('[shot] auth...');
const auth = await fetch(`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
  body: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: CLIENT_ID, AuthParameters: { USERNAME: 'king', PASSWORD: PW } }),
});
if (!auth.ok) { console.error(await auth.text()); process.exit(1); }
const t = (await auth.json()).AuthenticationResult;

console.log('[shot] launching browser...');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript((tok) => {
  localStorage.setItem('seraphim_id_token', tok.idToken);
  localStorage.setItem('seraphim_access_token', tok.accessToken);
  localStorage.setItem('seraphim_refresh_token', tok.refreshToken);
}, { idToken: t.IdToken, accessToken: t.AccessToken, refreshToken: t.RefreshToken });

await page.goto(DASH + '/', { timeout: 30_000, waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2500);

await page.evaluate(() => {
  const link = document.querySelector('a[data-view="zionx-app-development"]');
  link?.click();
});
await page.waitForTimeout(8000);

// Click the project in the sidebar
const clicked = await page.evaluate((id) => {
  const rows = Array.from(document.querySelectorAll('.harness-project-row'));
  const target = rows.find((r) => (r.getAttribute('data-project-id') ?? r.id ?? '').includes(id) || r.textContent?.includes(id));
  if (!target) {
    return { found: false, projectsCount: rows.length, sample: rows.slice(0, 5).map((r) => r.textContent?.trim().slice(0, 80)) };
  }
  target.click();
  return { found: true };
}, PROJECT);
console.log('[shot] project click:', clicked);
await page.waitForTimeout(3000);

await page.screenshot({ path: join(OUT, '04-with-project-selected.png'), fullPage: false });

// Capture the preview iframe specifically
const previewBox = await page.evaluate(() => {
  const el = document.querySelector('.harness-preview, .harness-preview__viewport, iframe');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
});
if (previewBox) {
  await page.screenshot({ path: join(OUT, '05-preview-final.png'), clip: previewBox });
  console.log('[shot] 05-preview-final.png (preview pane only)');
}

// Full studio
await page.screenshot({ path: join(OUT, '06-studio-full.png'), fullPage: false });
console.log('[shot] 06-studio-full.png (full window)');

await browser.close();

/**
 * Drive the live harness to build a tic-tac-toe game with upgraded UX.
 * Watches the SSE stream chip-by-chip, captures the running app, and
 * surfaces every error visible in the chat.
 */
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DASH = 'http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com';
const ALB  = 'http://seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com';
const COGNITO_REGION = 'us-east-1';
const CLIENT_ID = '77p41spm5d420kdg6ut9c6f4u1';
const USERNAME = 'king';
const PW = (await readFile(join(process.cwd(), '.probe-pw'), 'utf-8')).trim();
const OUT = join(process.cwd(), 'scripts', 'tictactoe-output');
await mkdir(OUT, { recursive: true });

const PROMPT = [
  'Build a tic-tac-toe game with top-of-the-line UX:',
  '• 3x3 board with smooth scale-in animation as cells fill',
  '• X = periwinkle accent, O = warm dawn tone (use design tokens)',
  '• Tap a cell → MotiView spring scale + haptic feedback',
  '• Detect winner — animate the winning line with a glowing stroke',
  '• Stats: track total wins per player, persist via zustand',
  '• "New game" button with calm motion when board resets',
  '• Empty/winner/draw states are designed (not blank)',
  'Keep it calm and premium — Calm-app aesthetic, not a flat HTML game.',
].join('\n');

const log = (...a) => console.log('[tic]', ...a);

// ---------- 1. Cognito auth ----------
log('authenticating...');
const authResp = await fetch(`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
  body: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: CLIENT_ID, AuthParameters: { USERNAME, PASSWORD: PW } }),
});
if (!authResp.ok) { console.error('auth failed:', await authResp.text()); process.exit(1); }
const tokens = (await authResp.json()).AuthenticationResult;
log('  authenticated');

// ---------- 2. browser ----------
log('launching browser...');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.addInitScript((t) => {
  localStorage.setItem('seraphim_id_token', t.idToken);
  localStorage.setItem('seraphim_access_token', t.accessToken);
  localStorage.setItem('seraphim_refresh_token', t.refreshToken);
}, { idToken: tokens.IdToken, accessToken: tokens.AccessToken, refreshToken: tokens.RefreshToken });

await page.goto(DASH + '/', { timeout: 30_000, waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(2500);

// ---------- 3. Open App Development tab ----------
const click1 = await page.evaluate(() => {
  const link = document.querySelector('a[data-view="zionx-app-development"]');
  if (!link) return false; link.click(); return true;
});
log('app-dev tab:', click1);
await page.waitForTimeout(7000);
await page.screenshot({ path: join(OUT, '01-tab-mounted.png'), fullPage: false });

// ---------- 4. Submit prompt ----------
const submitted = await page.evaluate(async (prompt) => {
  const ta = document.querySelector('.harness-chat__input textarea, .harness-chat__input [contenteditable]');
  if (!ta) return { found: false };
  if (ta.tagName === 'TEXTAREA') {
    ta.value = prompt;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    ta.textContent = prompt;
    ta.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
  const send = Array.from(document.querySelectorAll('button')).find((b) => /send|↑|⏎/i.test(b.textContent ?? '') || b.classList.toString().includes('send'));
  if (!send) return { found: true, sent: false };
  send.click();
  return { found: true, sent: true };
}, PROMPT);
log('prompt submitted:', submitted);
if (!submitted.sent) { await browser.close(); process.exit(1); }

// ---------- 5. Watch the stream ----------
log('watching stream (12 minutes max)...');
const start = Date.now();
const maxMs = 12 * 60_000;
let projectId = null;
let lastChipCount = 0;
let lastState = '';
const milestones = [];

while (Date.now() - start < maxMs) {
  await page.waitForTimeout(5000);
  const status = await page.evaluate(() => {
    const stream = document.querySelector('.harness-chat__stream');
    const chips = stream?.querySelectorAll('.harness-chat__chip')?.length ?? 0;
    const pills = stream?.querySelectorAll('.harness-quality-pill')?.length ?? 0;
    const errors = Array.from(stream?.querySelectorAll('[data-kind="error"], .harness-chat__error, .harness-chat__message--error') ?? [])
      .map((e) => e.textContent?.trim() ?? '').filter(Boolean);
    const previewState = document.querySelector('.harness-status-dot')?.parentElement?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const activeRow = document.querySelector('.harness-project-row.is-active, .harness-project-row[aria-current="true"]');
    const projectId = activeRow?.getAttribute('data-project-id') ?? null;
    const chatTail = Array.from(stream?.children ?? []).slice(-3).map((e) => e.textContent?.trim().replace(/\s+/g, ' ').slice(0, 160) ?? '');
    return { chips, pills, errors, previewState, projectId, chatTail };
  });
  const dt = Math.round((Date.now() - start) / 1000);
  if (status.projectId && !projectId) {
    projectId = status.projectId;
    log(`  [${dt}s] projectId=${projectId}`);
  }
  if (status.chips !== lastChipCount || status.previewState !== lastState) {
    log(`  [${dt}s] chips=${status.chips} pills=${status.pills} state="${status.previewState}"`);
    if (status.chatTail[status.chatTail.length - 1]) {
      log(`         tail: ${status.chatTail[status.chatTail.length - 1]}`);
    }
    if (status.errors.length) {
      status.errors.forEach((e) => log(`         ERROR: ${e.slice(0, 200)}`));
    }
    milestones.push({ t: dt, chips: status.chips, pills: status.pills, state: status.previewState });
    lastChipCount = status.chips;
    lastState = status.previewState;
  }
  // Done conditions
  if (status.pills >= 5) { log('  reviewers fired — done'); break; }
  if (/sandbox awake|live|ready/i.test(status.previewState)) { log(`  state="${status.previewState}" — preview up`); break; }
  if (status.errors.length > 3) { log('  too many errors — bailing'); break; }
}

// ---------- 6. Final screenshots ----------
await page.screenshot({ path: join(OUT, '02-after-stream.png'), fullPage: false });

const previewBox = await page.evaluate(() => {
  const el = document.querySelector('.harness-preview, iframe');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
});
if (previewBox) {
  await page.screenshot({ path: join(OUT, '03-preview.png'), clip: previewBox });
  log('  preview screenshot: 03-preview.png');
}

// ---------- 7. Pull files via API ----------
let filesInspect = null;
if (projectId) {
  try {
    const r = await fetch(`${ALB}/api/app-dev/projects/${projectId}/files`, { headers: { Authorization: `Bearer ${tokens.IdToken}` } });
    if (r.ok) {
      const data = await r.json();
      filesInspect = { count: data.files?.length ?? 0, files: data.files ?? [] };
      log(`  ${filesInspect.count} files in project`);
    }
  } catch (e) { log('  files fetch err:', e.message); }
}

await writeFile(join(OUT, 'results.json'), JSON.stringify({
  projectId,
  milestones,
  files: filesInspect,
  pageErrors,
  durationSec: Math.round((Date.now() - start) / 1000),
}, null, 2), 'utf-8');

await browser.close();

log('\n=== SUMMARY ===');
log('projectId:', projectId);
log('chips:', lastChipCount);
log('final state:', lastState);
log('files written:', filesInspect?.count ?? '?');
log('duration:', Math.round((Date.now() - start) / 1000) + 's');
log('artifacts:', OUT);

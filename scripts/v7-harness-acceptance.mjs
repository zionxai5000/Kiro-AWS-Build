/**
 * V7 acceptance — habit-tracker against the LIVE harness studio.
 *
 * Flow:
 *  1. Cognito login as `king` (temp pw from .probe-pw)
 *  2. Seed tokens, load dashboard, click ZionX → App Development
 *  3. Confirm harness mounted (3-column UI with full nav around it)
 *  4. Type a habit-tracker prompt, click Send, watch SSE stream
 *  5. Capture spec card chat bubble (V7.5)
 *  6. Capture sidebar score pill (V7.6)
 *  7. Capture preview screenshot of the running app (V7.4)
 *  8. Pull the project's app/(tabs)/index.tsx via the API and inspect
 *     for gradient + MotiView + withSpring + Haptics + accent (V7.3)
 *  9. Read final quality score from project meta (V7.2 ≥70)
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
const OUT = join(process.cwd(), 'scripts', 'v7-acceptance-output');
await mkdir(OUT, { recursive: true });

const HABIT_PROMPT = 'Build a calm habit tracker. 3 seeded habits: drink water 💧, walk 10k steps 👟, read 20 minutes 📚. Tap a card to mark it done today and bump the streak. Persist habits in zustand. Use the design tokens — periwinkle accent, soft dark gradient, MotiView fade-up entry, scale-down on press, haptic on tap.';

const log = (...a) => console.log('[v7]', ...a);

// ---------- 1. Cognito auth ----------
log('authenticating...');
const authResp = await fetch(`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
  body: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: CLIENT_ID, AuthParameters: { USERNAME, PASSWORD: PW } }),
});
if (!authResp.ok) { console.error('auth failed:', await authResp.text()); process.exit(1); }
const auth = await authResp.json();
const tokens = auth.AuthenticationResult;
log('  authenticated');

// ---------- 2. browser ----------
log('launching browser...');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.addInitScript((t) => {
  localStorage.setItem('seraphim_id_token', t.idToken);
  localStorage.setItem('seraphim_access_token', t.accessToken);
  localStorage.setItem('seraphim_refresh_token', t.refreshToken);
}, { idToken: tokens.IdToken, accessToken: tokens.AccessToken, refreshToken: tokens.RefreshToken });

log('loading dashboard...');
await page.goto(DASH + '/', { timeout: 30_000, waitUntil: 'networkidle' }).catch((e) => log('  goto warn:', e.message));
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, '00-dashboard-bare.png'), fullPage: false });

// ---------- 3. click App Development ----------
log('clicking App Development tab...');
const clickResult = await page.evaluate(() => {
  const link = document.querySelector('a[data-view="zionx-app-development"]');
  if (!link) return { found: false };
  link.click();
  return { found: true, text: link.textContent?.trim() };
});
if (!clickResult.found) { log('FAIL — App Development link not found'); process.exit(1); }
log('  click ok:', clickResult);
await page.waitForTimeout(8000); // boot retry window
await page.screenshot({ path: join(OUT, '01-app-development-mounted.png'), fullPage: false });

// ---------- 4. type prompt and send ----------
log('typing prompt...');
const submitted = await page.evaluate(async (prompt) => {
  // Find the chat textarea — view uses .harness-chat__input or a contenteditable
  const ta = document.querySelector('.harness-chat__input textarea, .harness-chat__input [contenteditable]');
  if (!ta) return { found: false, html: document.querySelector('.harness-chat')?.outerHTML?.slice(0, 800) };
  if (ta.tagName === 'TEXTAREA') {
    ta.value = prompt;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    ta.textContent = prompt;
    ta.dispatchEvent(new InputEvent('input', { bubbles: true, data: prompt, inputType: 'insertText' }));
  }
  // Find the send button
  const sendBtn = Array.from(document.querySelectorAll('button')).find((b) => /send|↑|⏎/i.test(b.textContent ?? '') || b.classList.toString().includes('send'));
  if (!sendBtn) return { found: true, sent: false, btn: 'not found' };
  sendBtn.click();
  return { found: true, sent: true };
}, HABIT_PROMPT);
log('  submit result:', submitted);
if (!submitted.found || !submitted.sent) {
  await writeFile(join(OUT, 'submit-debug.html'), submitted.html ?? '(no html)', 'utf-8');
  log('  could not submit — see submit-debug.html');
}

// Wait for SSE stream — generation takes 60-180s with reviewers + retries.
// First-time runs after a fresh ECS task can take longer because the
// backend hydrates the S3-backed workspace at boot. Give it 8 minutes.
log('waiting for SSE stream (8 minutes max)...');
const startSse = Date.now();
const maxMs = 480_000;
let lastChipCount = 0;
while (Date.now() - startSse < maxMs) {
  await page.waitForTimeout(5000);
  const status = await page.evaluate(() => {
    const stream = document.querySelector('.harness-chat__stream');
    const chips = stream?.querySelectorAll('.harness-chat__chip')?.length ?? 0;
    const pills = stream?.querySelectorAll('.harness-quality-pill')?.length ?? 0;
    const planCard = !!document.querySelector('.harness-chat__plan');
    const streaming = !!document.querySelector('.harness-chat__input button.streaming, [data-streaming="true"]');
    const previewState = document.querySelector('.harness-status-dot')?.parentElement?.textContent?.slice(0, 60) ?? '';
    return { chips, pills, planCard, streaming, previewState };
  });
  const dt = Math.round((Date.now() - startSse) / 1000);
  log(`  [+${dt}s] chips=${status.chips} pills=${status.pills} plan=${status.planCard} state="${status.previewState.replace(/\s+/g, ' ').trim()}"`);
  if (status.pills > 0 && status.chips > lastChipCount) lastChipCount = status.chips;
  // done when reviewer pills are present
  if (status.pills >= 4) { log('  reviewers fired — done'); break; }
  // also exit if state goes back to idle/live (success) or error
  if (/idle|live|error|done/i.test(status.previewState)) { log(`  state ${status.previewState} — done`); break; }
}

// ---------- 5,6,7 captures ----------
await page.screenshot({ path: join(OUT, '02-after-stream.png'), fullPage: false });

// Capture the chat content + any error bubbles so we know WHY the run ended.
const chatState = await page.evaluate(() => {
  const errorBubbles = Array.from(document.querySelectorAll('.harness-chat__message--error, [data-kind="error"], .harness-chat__error'))
    .map((e) => e.textContent?.trim() ?? '').filter(Boolean);
  const allChatText = Array.from(document.querySelectorAll('.harness-chat__stream > *'))
    .map((e) => e.textContent?.trim().replace(/\s+/g, ' ').slice(0, 220) ?? '').filter(Boolean);
  return { errorBubbles, allChatText };
});
log(`  chat messages: ${chatState.allChatText.length}`);
log('  chat tail (last 8):');
chatState.allChatText.slice(-8).forEach((line, i) => log(`     ${i + 1}. ${line}`));
if (chatState.errorBubbles.length) {
  log('  ERROR BUBBLES IN CHAT:');
  chatState.errorBubbles.forEach((e) => log(`     ! ${e}`));
}

// V7.5 — spec card crop
const planCardBox = await page.evaluate(() => {
  const el = document.querySelector('.harness-chat__plan');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
if (planCardBox) {
  await page.screenshot({ path: join(OUT, '03-spec-card.png'), clip: planCardBox });
  log('  V7.5 spec card captured');
} else {
  log('  V7.5 spec card NOT FOUND in DOM');
}

// V7.6 — sidebar score pill crop
const pillBox = await page.evaluate(() => {
  const el = document.querySelector('.harness-project-row__pill');
  if (!el) return null;
  const row = el.closest('.harness-project-row') ?? el;
  const r = row.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
if (pillBox) {
  await page.screenshot({ path: join(OUT, '04-score-pill.png'), clip: pillBox });
  log('  V7.6 score pill captured');
} else {
  log('  V7.6 score pill NOT FOUND in DOM');
}

// V7.4 — preview screenshot
const previewBox = await page.evaluate(() => {
  const el = document.querySelector('.harness-preview, .harness-preview__viewport, iframe');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
if (previewBox) {
  await page.screenshot({ path: join(OUT, '05-preview.png'), clip: previewBox });
  log('  V7.4 preview captured');
}

// ---------- 8 + 9 — pull project meta + generated source via the API ----------
const projectId = await page.evaluate(() => {
  const a = document.querySelector('.harness-project-row.is-active');
  return a?.getAttribute('data-project-id') ?? a?.id ?? null;
});
log('  active project:', projectId);

let inspect = { qualityScore: null, sourceChecks: null };
if (projectId) {
  try {
    const idTok = tokens.IdToken;
    const filesResp = await fetch(`${ALB}/api/app-dev/projects/${projectId}/files`, { headers: { Authorization: `Bearer ${idTok}` } });
    const filesJson = filesResp.ok ? await filesResp.json() : null;
    log('  files:', filesJson ? (filesJson.files?.length ?? 0) + ' files' : 'fetch failed ' + filesResp.status);

    // Try multiple candidate paths for the main screen
    const candidates = ['app/(tabs)/index.tsx', 'app/index.tsx', 'src/screens/Habits.tsx', 'screens/index.tsx'];
    for (const path of candidates) {
      const r = await fetch(`${ALB}/api/app-dev/projects/${projectId}/file?path=${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${idTok}` } });
      if (!r.ok) continue;
      const body = await r.json();
      const src = body.content ?? body.body ?? '';
      if (!src) continue;
      log(`  inspecting ${path} (${src.length} chars)`);
      inspect.sourceChecks = {
        path,
        gradient: /LinearGradient|linear-gradient/i.test(src),
        motiView: /MotiView|moti\b/i.test(src),
        withSpring: /withSpring|reanimated/i.test(src),
        haptics: /Haptics\.|expo-haptics/i.test(src),
        accent: /#7C83FF|periwinkle|accent\.primary/i.test(src),
      };
      break;
    }

    // V7.2 quality score
    const projResp = await fetch(`${ALB}/api/app-dev/projects/${projectId}`, { headers: { Authorization: `Bearer ${idTok}` } });
    if (projResp.ok) {
      const proj = await projResp.json();
      const qg = proj.qualityGate ?? proj.meta?.qualityGate;
      if (qg) {
        const min = Math.min(qg.visualPolishScore ?? 0, qg.persistenceScore ?? 0, qg.domainFitnessScore ?? 0, qg.onboardingScore ?? 0);
        inspect.qualityScore = { ...qg, min };
      }
    }
  } catch (e) {
    log('  meta inspect error:', e.message);
  }
}

await writeFile(join(OUT, 'results.json'), JSON.stringify({
  cognito: 'ok',
  appDevTab: clickResult,
  prompt: HABIT_PROMPT,
  projectId,
  inspect,
  consoleErrorCount: consoleErrors.length,
  consoleErrorSample: consoleErrors.slice(0, 5),
}, null, 2), 'utf-8');

await browser.close();

// Verdict
const checks = inspect.sourceChecks ?? {};
const score = inspect.qualityScore?.min ?? 0;
const v72 = score >= 70;
const v73 = checks.gradient && checks.motiView && checks.withSpring && checks.haptics && checks.accent;
log('');
log('verdict:');
log(`  V7.1 acceptance ran:        ${projectId ? 'YES' : 'NO'}`);
log(`  V7.2 quality score >= 70:   ${v72 ? 'YES' : 'NO'} (${score}/100)`);
log(`  V7.3 source has 5 markers:  ${v73 ? 'YES' : 'NO'} (${JSON.stringify(checks)})`);
log(`  V7.4 preview screenshot:    ${previewBox ? 'YES' : 'NO'}`);
log(`  V7.5 spec card screenshot:  ${planCardBox ? 'YES' : 'NO'}`);
log(`  V7.6 score pill screenshot: ${pillBox ? 'YES' : 'NO'}`);
process.exit((v72 && v73 && previewBox && planCardBox && pillBox) ? 0 : 1);

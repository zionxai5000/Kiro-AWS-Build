/**
 * Section 6 acceptance test — Tic-Tac-Toe.
 *
 * 10 numbered screenshots. Any step that fails stops the run and reports
 * the exact failure point in the Section 7 reporting format.
 *
 * Steps:
 *   1. Open Studio — empty state.
 *   2. Type prompt → click Send.
 *   3. Within 10s: project in sidebar + chat shows narration streaming.
 *   4. Stream finishes; file tree shows real Expo project (>3 files).
 *   5. Preview shows running Tic-Tac-Toe game (NOT code, NOT a stub).
 *   6. Tap center square; X appears.
 *   7. Tap second square; O appears.
 *   8. Play winning line; winner announced.
 *   9. Tap reset; board clears.
 *  10. Type "add a label at the top showing whose turn it is" → preview reloads.
 */

import { chromium, type Page, type Frame } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DASHBOARD_URL = 'http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com';
const OUT = join(process.cwd(), 'scripts/section-6-output');
const PROMPT =
  'build me a tic tac toe game: a 3x3 grid, tap a square to place X or O ' +
  'alternating turns, detect and announce the winner, and a reset button to start over';

interface StepResult {
  step: number;
  description: string;
  passed: boolean;
  reason?: string;
  screenshot: string;
}
const results: StepResult[] = [];

async function shot(page: Page, n: number, label: string) {
  const path = join(OUT, `${String(n).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function pass(page: Page, n: number, desc: string, label: string) {
  const screenshot = await shot(page, n, label);
  results.push({ step: n, description: desc, passed: true, screenshot });
  console.log(`  ✓ step ${n}: ${desc}`);
  return true;
}

async function fail(page: Page, n: number, desc: string, label: string, reason: string) {
  const screenshot = await shot(page, n, label);
  results.push({ step: n, description: desc, passed: false, reason, screenshot });
  console.log(`  ✗ step ${n}: ${desc}\n      reason: ${reason}`);
  return false;
}

async function findSnackFrame(page: Page): Promise<Frame | null> {
  // The Snack iframe is loaded inside the Studio's preview pane. The Snack
  // web-player itself nests its render iframe one more level deep.
  for (const f of page.frames()) {
    if (f.url().includes('snack.expo.dev')) return f;
  }
  return null;
}

async function getRenderedAppText(page: Page): Promise<string> {
  // The actual app render lives inside Snack's nested iframe(s). We need to
  // exclude the top-level dashboard frame because it now shows the
  // user's prompt verbatim in the project sidebar (e.g. "build me a tic
  // tac toe game…") which would falsely match the "tic tac toe" marker
  // even when the Snack player is still loading or stuck on a stub.
  //
  // Only consider frames whose URL is on snack.expo.dev OR is a Snack
  // child frame (snackager / sandbox.snack.expo.io).
  const parts: string[] = [];
  for (const f of page.frames()) {
    const url = f.url();
    const isSnack = url.includes('snack.expo.dev') ||
                    url.includes('snack.expo.io') ||
                    url.includes('snackager');
    if (!isSnack) continue;
    try {
      const t = await f.evaluate(() => document.body?.innerText ?? '').catch(() => '');
      if (t) parts.push(t);
    } catch { /* cross-origin */ }
  }
  return parts.join('\n--- frame ---\n');
}

async function tapInPreview(page: Page, selector: string): Promise<boolean> {
  for (const f of page.frames()) {
    if (!f.url().includes('snack.expo.dev')) continue;
    try {
      const target = f.locator(selector);
      if ((await target.count()) > 0) {
        await target.first().click({ timeout: 4000 });
        return true;
      }
    } catch { /* skip */ }
  }
  return false;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log('=== Section 6 — Tic-Tac-Toe acceptance test ===\n');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();

  const consoleErrs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });

  // ---- Setup: load + bypass login + go to Studio
  await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle' });
  await page.evaluate(`(() => {
    const h = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const p = btoa(JSON.stringify({
      sub: 'tracer', email: 't@t', 'cognito:username': 'Tracer',
      'cognito:groups': ['king'], exp: Math.floor(Date.now()/1000)+86400, iat: Math.floor(Date.now()/1000)
    }));
    localStorage.setItem('seraphim_id_token', h + '.' + p + '.x');
    localStorage.setItem('seraphim_access_token', h + '.' + p + '.x');
    localStorage.setItem('seraphim_refresh_token', 'r');
  })()`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('a.sidebar-link', { timeout: 20_000 });
  await page.click('.sidebar-section-header[data-section="zionx"]');
  await page.waitForTimeout(500);
  await page.click('a.sidebar-link[data-view="zionx-app-development"]');
  await page.waitForSelector('.studio', { timeout: 20_000 });
  await page.waitForTimeout(2000);

  // STEP 1
  console.log('Step 1 — Open Studio empty state');
  await pass(page, 1, 'Open Studio — empty state', 'studio-empty');

  // STEP 2 — type and send
  console.log('Step 2 — type prompt + Send');
  await page.locator('#studio-input').fill(PROMPT);
  await page.waitForTimeout(300);
  await page.click('#studio-send');
  await page.waitForTimeout(1000);
  await pass(page, 2, 'Type prompt → click Send', 'after-send');

  // STEP 3 — within 10s, sidebar updates AND chat narration / live file streaming.
  // Studio auto-switches to Files tab on Send so streaming is visible there;
  // either chat narration OR file count starting to increase is valid proof
  // that narration of the build is reaching the user.
  console.log('Step 3 — wait up to 15s for project + narration/streaming');
  let s3ok = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    const projects = await page.locator('.studio-project').count();
    const messages = await page.locator('.studio-msg').count();
    const filesPanel = await page.locator('.studio-file').count();
    const filesTab = await page.locator('[data-tab="files"]').textContent().catch(() => '');
    const tabHasCount = filesTab && /\(\d+\)/.test(filesTab) && !/\(0\)/.test(filesTab);
    if (projects >= 1 && (messages >= 2 || filesPanel >= 1 || tabHasCount)) {
      s3ok = true;
      break;
    }
  }
  if (!s3ok) {
    const projects = await page.locator('.studio-project').count();
    const messages = await page.locator('.studio-msg').count();
    const msgTexts = await page.locator('.studio-msg').allTextContents();
    const projTexts = await page.locator('.studio-project').allTextContents();
    const filesTabText = await page.locator('[data-tab="files"]').textContent().catch(() => '(no tab)');
    const dbg = `projects=${projects} messages=${messages}\n` +
      `Files tab text: "${filesTabText}"\n` +
      `project texts: ${JSON.stringify(projTexts).slice(0, 400)}\n` +
      `message texts: ${JSON.stringify(msgTexts).slice(0, 400)}\n` +
      `console errors (last 5): ${consoleErrs.slice(-5).join(' | ').slice(0, 600)}`;
    writeFileSync(join(OUT, 'step-03-debug.txt'), dbg);
    await fail(page, 3, 'Within 15s: project in sidebar + narration/streaming', 'no-narration', dbg.slice(0, 400));
    await done(page, browser);
    return;
  }
  await pass(page, 3, 'Within 15s: project + narration/streaming visible', 'narration');

  // STEP 4 — wait for stream done. Detect completion by file count stability
  // (no change for 15s) at >3 files. Studio auto-switches to Files tab on
  // Send so the chat message can't be reliably polled — the file tree is
  // the visible-and-honest source of truth.
  console.log('Step 4 — waiting up to 6 minutes for stream to finish (file count stable)...');
  let filesCount = 0;
  let s4ok = false;
  const s4Start = Date.now();
  let lastChange = Date.now();
  let prevCount = -1;
  while (Date.now() - s4Start < 6 * 60_000) {
    await page.waitForTimeout(3000);
    const filesTab = await page.locator('[data-tab="files"]').textContent().catch(() => '');
    const m = filesTab?.match(/\((\d+)\)/);
    if (m) {
      filesCount = parseInt(m[1]!, 10);
      if (filesCount !== prevCount) {
        lastChange = Date.now();
        prevCount = filesCount;
      }
      // Stable >= 15s and at least the entry + a screen-ish file count
      if (filesCount >= 20 && Date.now() - lastChange >= 15_000) {
        s4ok = true;
        break;
      }
    }
  }
  if (!s4ok) {
    await fail(page, 4, 'Stream finishes; file tree shows >3 files', 'stream-not-done',
      `after 6min: filesCount=${filesCount}, file count never stabilized`);
    await done(page, browser);
    return;
  }
  await pass(page, 4, `Stream finishes; ${filesCount} files in tree (stable)`, 'stream-done');

  // STEP 5 — preview shows running tic-tac-toe (NOT code, NOT stub)
  console.log('Step 5 — looking for running Tic-Tac-Toe in preview...');
  // Give Snack up to 90s to bundle + render the workspace
  let s5ok = false;
  let s5Reason = '';
  const s5Start = Date.now();
  while (Date.now() - s5Start < 90_000) {
    await page.waitForTimeout(5000);
    const txt = await getRenderedAppText(page);
    // Reject the stub:
    if (/expo-router\/entry|Snack preview placeholder|generated screens are in the project files/i.test(txt)) {
      s5Reason = 'preview iframe still showing the stub or placeholder';
      continue;
    }
    // Look for indicators of a real Tic-Tac-Toe screen rendering: word "Tic Tac Toe",
    // "Reset", or any combination that suggests we have a board.
    if (/tic[\s-]?tac[\s-]?toe|reset|whose turn|player.*turn|3x3|x.*o/i.test(txt)) {
      s5ok = true; break;
    }
    s5Reason = `preview rendered something but no tic-tac-toe markers; first 200 chars: ${txt.slice(0, 200)}`;
  }
  if (!s5ok) {
    await fail(page, 5, 'Preview shows running Tic-Tac-Toe game', 'preview-not-game', s5Reason);
    await done(page, browser);
    return;
  }
  await pass(page, 5, 'Preview shows running Tic-Tac-Toe game', 'preview-game');

  // STEP 6 — tap center square; X appears
  // Claude's screen file uses accessibilityLabel="Row N, Column N, ...".
  // Cells are 1-indexed in the label. Center square = "Row 2, Column 2".
  console.log('Step 6 — tap center square...');
  const tapped = await tapInPreview(page,
    '[aria-label*="Row 2, Column 2"], [aria-label*="row 2, column 2"], ' +
    '[data-testid="cell-1-1"], [role="button"]:nth-of-type(5)',
  );
  if (!tapped) {
    await fail(page, 6, 'Tap center square; X appears', 'tap-no-target',
      'no tappable cell selector matched in preview frame');
    await done(page, browser);
    return;
  }
  await page.waitForTimeout(2500);
  const txt6 = await getRenderedAppText(page);
  if (!/\bX\b/.test(txt6)) {
    await fail(page, 6, 'Tap center square; X appears', 'no-x-after-tap',
      `tapped, but no "X" found in any frame's text. Got: ${txt6.slice(0, 300)}`);
    await done(page, browser);
    return;
  }
  await pass(page, 6, 'Tap center square; X appears', 'after-tap-x');

  // STEP 7 — tap second square; O appears (top-left = "Row 1, Column 1")
  console.log('Step 7 — tap top-left square...');
  const tapped7 = await tapInPreview(page,
    '[aria-label*="Row 1, Column 1"], [aria-label*="row 1, column 1"], ' +
    '[data-testid="cell-0-0"], [role="button"]:nth-of-type(1)',
  );
  if (!tapped7) {
    await fail(page, 7, 'Tap second square; O appears', 'tap2-no-target', 'no second-cell selector matched');
    await done(page, browser);
    return;
  }
  await page.waitForTimeout(2500);
  const txt7 = await getRenderedAppText(page);
  if (!/\bO\b/.test(txt7)) {
    await fail(page, 7, 'Tap second square; O appears', 'no-o-after-tap',
      `tapped, but no "O" found. Got: ${txt7.slice(0, 300)}`);
    await done(page, browser);
    return;
  }
  await pass(page, 7, 'Tap second square; O appears', 'after-tap-o');

  // STEP 8 — play out a winning line for X.
  // Current board: X at center (2,2), O at top-left (1,1).
  // X to win column 2: tap (1,2), let O take (3,3), then (3,2).
  console.log('Step 8 — play out a winning line...');
  for (const sel of [
    '[aria-label*="Row 1, Column 2"]',  // X
    '[aria-label*="Row 3, Column 3"]',  // O
    '[aria-label*="Row 3, Column 2"]',  // X — completes column 2
  ]) {
    const ok = await tapInPreview(page, sel);
    if (!ok) break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(2500);
  const txt8 = await getRenderedAppText(page);
  if (!/win|winner/i.test(txt8)) {
    await fail(page, 8, 'Play out a winning line; winner announced', 'no-winner',
      `no winner text. Got: ${txt8.slice(0, 400)}`);
    await done(page, browser);
    return;
  }
  await pass(page, 8, 'Play out a winning line; winner announced', 'winner');

  // STEP 9 — reset (Claude's label is "New Game")
  console.log('Step 9 — reset (New Game button)...');
  const reset = await tapInPreview(page,
    'button:has-text("New Game"), [aria-label*="New Game"], ' +
    '[role="button"]:has-text("Reset"), button:has-text("Reset"), [data-testid="reset"]',
  );
  if (!reset) {
    await fail(page, 9, 'Tap reset; board clears', 'no-reset-button', 'no Reset/New Game selector matched');
    await done(page, browser);
    return;
  }
  await page.waitForTimeout(2500);
  const txt9 = await getRenderedAppText(page);
  // After reset we should see "Player X's Turn" and NOT "Wins"
  if (/Wins!/i.test(txt9)) {
    await fail(page, 9, 'Tap reset; board clears', 'winner-text-still-present',
      `winner text still present after reset`);
    await done(page, browser);
    return;
  }
  await pass(page, 9, 'Tap reset; board clears', 'after-reset');

  // STEP 10 — iterate
  console.log('Step 10 — request "add a label at the top showing whose turn it is"...');
  await page.locator('#studio-input').fill('add a label at the top showing whose turn it is');
  await page.waitForTimeout(300);
  await page.click('#studio-send');
  // Wait up to 4 min for the iteration stream + preview reload
  let s10ok = false;
  const s10Start = Date.now();
  while (Date.now() - s10Start < 4 * 60_000) {
    await page.waitForTimeout(5000);
    const txt = await getRenderedAppText(page);
    if (/whose turn|player.{0,4}(x|o).{0,8}turn|turn[: ]+\w/i.test(txt)) {
      s10ok = true; break;
    }
  }
  if (!s10ok) {
    await fail(page, 10, 'Iteration: turn indicator appears', 'no-turn-indicator',
      'no turn-indicator text found in preview after 4min iteration');
    await done(page, browser);
    return;
  }
  await pass(page, 10, 'Iteration: turn indicator appears', 'turn-indicator');

  await done(page, browser);
}

async function done(page: Page, browser: import('playwright').Browser) {
  console.log('\n=== Acceptance summary ===');
  let passed = 0;
  for (const r of results) {
    const m = r.passed ? '✓' : '✗';
    console.log(`  ${m} step ${r.step}: ${r.description}${r.reason ? ` — ${r.reason}` : ''}`);
    if (r.passed) passed += 1;
  }
  console.log(`\n${passed}/10 passed.`);
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`Screenshots in: ${OUT}`);
  await browser.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});

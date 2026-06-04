/**
 * Final capture run for the latest habit tracker. Captures:
 *  1. Initial state (empty + onboarding)
 *  2. After tapping Add Habit (modal opens)
 *  3. After filling input + tapping save (try multiple save labels)
 *  4. Populated habit list (after returning to main)
 *  5. After tapping a habit row to mark complete
 *
 * Each post-action capture is frame-diffed against the prior frame.
 * Identical-frame failures are reported, not hidden.
 */
import { chromium, Page, Frame } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertChangedAfterAction } from '../.kiro/scripts/frame-diff.js';

const SNACK_URL = 'https://snack.expo.dev/embedded/@zionxai/zionx-app?platform=web&preview=true&theme=dark&hideQueryParams=true';
const OUT = 'scripts/final-screens';

async function findRuntime(page: Page): Promise<Frame | null> {
  for (const f of page.frames()) {
    if (f.url().includes('snack-runtime.eascdn.net')) return f;
  }
  return null;
}

async function tapByText(runtime: Frame, patterns: RegExp[]): Promise<string | null> {
  return await runtime.evaluate((srcArr) => {
    const regs = srcArr.map((s) => new RegExp(s, 'i'));
    const els = Array.from(document.querySelectorAll<HTMLElement>('div, button, [role="button"]'));
    for (const reg of regs) {
      const target = els.find((e) => reg.test((e.innerText ?? '').trim()) && e.offsetParent !== null);
      if (target) { target.click(); return target.innerText; }
    }
    return null;
  }, patterns.map((r) => r.source)).catch(() => null);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();

  console.log('[1/6] opening snack...');
  await page.goto(SNACK_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  let runtime: Frame | null = null;
  for (let i = 0; i < 240; i++) {
    runtime = await findRuntime(page);
    if (runtime) { console.log(`     spawned at ${i + 1}s`); break; }
    await page.waitForTimeout(1000);
  }
  if (!runtime) { console.log('FATAL'); await browser.close(); return; }

  await page.waitForTimeout(45_000);

  // Capture 1
  console.log('[2/6] capturing initial state...');
  await page.screenshot({ path: join(OUT, '01-initial.png'), fullPage: false });
  let prev = readFileSync(join(OUT, '01-initial.png'));

  // Action: skip onboarding if present
  console.log('[3/6] dismissing onboarding (if present)...');
  const dismissed = await tapByText(runtime, [/^skip$/i, /^get\s*started$/i, /^continue$/i, /^done$/i, /^next$/i]);
  console.log(`     tapped: ${dismissed}`);
  if (dismissed) {
    await page.waitForTimeout(8000);
    await page.screenshot({ path: join(OUT, '02-after-dismiss.png'), fullPage: false });
    let cur = readFileSync(join(OUT, '02-after-dismiss.png'));
    console.log(`     ${assertChangedAfterAction(prev, cur, 'Skip onboarding', 0.005).reason}`);
    prev = cur;
    runtime = (await findRuntime(page)) ?? runtime;
  }

  // Action: tap Add
  console.log('[4/6] tapping Add Habit...');
  const addClicked = await tapByText(runtime, [/^\+$/, /^add\s*habit$/i, /^new\s*habit$/i, /^add$/i, /^\+\s*new$/i]);
  console.log(`     tapped: ${addClicked}`);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(OUT, '03-add-modal.png'), fullPage: false });
  let cur = readFileSync(join(OUT, '03-add-modal.png'));
  const r1 = assertChangedAfterAction(prev, cur, 'Add tap', 0.005);
  console.log(`     ${r1.reason}`);
  prev = cur;

  if (r1.ok) {
    // Action: fill name + save
    console.log('[5/6] filling name + saving...');
    const filled = await runtime.evaluate(() => {
      const inp = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type]), textarea'))
        .find((el) => el.offsetParent !== null);
      if (inp) {
        inp.focus();
        inp.value = 'Drink water';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }).catch(() => false);
    console.log(`     input filled: ${filled}`);
    await page.waitForTimeout(1000);

    // Try every plausible save button label
    const saveTapped = await tapByText(runtime, [/^add\s*habit$/i, /^save$/i, /^create$/i, /^done$/i, /^add$/i, /^save\s*habit$/i, /^create\s*habit$/i]);
    console.log(`     save tapped: ${saveTapped}`);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: join(OUT, '04-after-save.png'), fullPage: false });
    cur = readFileSync(join(OUT, '04-after-save.png'));
    const r2 = assertChangedAfterAction(prev, cur, 'Save', 0.005);
    console.log(`     ${r2.reason}`);
    prev = cur;

    // Action: tap a habit row to mark complete
    console.log('[6/6] tapping habit to mark complete...');
    const completeTapped = await tapByText(runtime, [/water/i, /tap\s*to\s*complete/i, /mark\s*complete/i]);
    console.log(`     complete tapped: ${completeTapped}`);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(OUT, '05-completed.png'), fullPage: false });
    cur = readFileSync(join(OUT, '05-completed.png'));
    const r3 = assertChangedAfterAction(prev, cur, 'Complete', 0.005);
    console.log(`     ${r3.reason}`);
  }

  let text = '';
  for (const f of page.frames()) {
    if (f.url().includes('snack-runtime.eascdn.net')) {
      text = await f.evaluate(() => document.body?.innerText ?? '').catch(() => '');
      break;
    }
  }
  writeFileSync(join(OUT, 'runtime-text.txt'), text);
  console.log('\nFinal runtime text:', text.slice(0, 300).replace(/\s+/g, ' '));

  await browser.close();
  console.log('Output:', OUT);
}
void main().catch((e) => { console.error(e); process.exit(2); });

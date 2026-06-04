/**
 * Full capture: empty → tap add → fill → save → mark complete.
 * Goal: end on a populated state with at least 1 habit.
 */
import { chromium, Page, Frame } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertChangedAfterAction } from '../.kiro/scripts/frame-diff.js';

const SNACK_URL = 'https://snack.expo.dev/embedded/@zionxai/zionx-app?platform=web&preview=true&theme=dark&hideQueryParams=true';
const OUT = 'scripts/screens-48';

async function findRuntime(page: Page): Promise<Frame | null> {
  for (const f of page.frames()) {
    if (f.url().includes('snack-runtime.eascdn.net')) return f;
  }
  return null;
}

async function tap(runtime: Frame, patterns: RegExp[]): Promise<string | null> {
  return await runtime.evaluate((srcs) => {
    const regs = srcs.map((s) => new RegExp(s, 'i'));
    const els = Array.from(document.querySelectorAll<HTMLElement>('div, button, [role="button"]'));
    for (const r of regs) {
      const t = els.find((e) => r.test((e.innerText ?? '').trim()) && e.offsetParent !== null);
      if (t) { t.click(); return t.innerText; }
    }
    return null;
  }, patterns.map((p) => p.source)).catch(() => null);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(SNACK_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  let runtime: Frame | null = null;
  for (let i = 0; i < 240; i++) {
    runtime = await findRuntime(page);
    if (runtime) break;
    await page.waitForTimeout(1000);
  }
  if (!runtime) { console.log('FATAL'); await browser.close(); return; }

  await page.waitForTimeout(60_000);

  // 1. Empty / first-launch
  await page.screenshot({ path: join(OUT, '01-empty.png'), fullPage: false });
  let prev = readFileSync(join(OUT, '01-empty.png'));
  console.log('captured 01 — empty');

  // 2. Tap Add Habit
  const tapped = await tap(runtime, [/^\+$/, /^add\s*habit$/i, /^new\s*habit$/i, /^add$/i]);
  console.log('add tapped:', tapped);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(OUT, '02-add-modal.png'), fullPage: false });
  let cur = readFileSync(join(OUT, '02-add-modal.png'));
  console.log(' ', assertChangedAfterAction(prev, cur, 'Add', 0.005).reason);
  prev = cur;

  // 3. Fill name + emoji + color
  await runtime.evaluate(() => {
    const inp = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type]), textarea'))
      .find((el) => el.offsetParent !== null);
    if (inp) {
      inp.focus();
      inp.value = 'Drink water';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }).catch(() => {});
  await page.waitForTimeout(2000);

  // 4. Save
  const saved = await tap(runtime, [/^add\s*habit$/i, /^save\s*habit$/i, /^create\s*habit$/i, /^save$/i, /^create$/i, /^done$/i]);
  console.log('save tapped:', saved);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(OUT, '03-after-save.png'), fullPage: false });
  cur = readFileSync(join(OUT, '03-after-save.png'));
  console.log(' ', assertChangedAfterAction(prev, cur, 'Save', 0.005).reason);

  // 5. Wait + final populated state
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(OUT, '04-populated.png'), fullPage: false });
  console.log('captured 04 — populated');

  // 6. Try to tap habit row to mark complete
  const completed = await tap(runtime, [/water/i, /drink/i, /tap\s*to\s*complete/i]);
  console.log('complete:', completed);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(OUT, '05-completed.png'), fullPage: false });

  let text = '';
  for (const f of page.frames()) {
    if (f.url().includes('snack-runtime.eascdn.net')) {
      text = await f.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    }
  }
  writeFileSync(join(OUT, 'runtime.txt'), text);
  console.log('Final runtime:', text.slice(0, 300).replace(/\s+/g, ' '));
  await browser.close();
}
void main().catch((e) => { console.error(e); process.exit(2); });

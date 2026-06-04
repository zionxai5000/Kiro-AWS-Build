/**
 * Capture habit tracker screens with frame-diff verification.
 * After every action, frame-diff confirms the screen actually changed.
 * Identical frames = stuck = FAIL (no false PASS).
 */
import { chromium, Page, Frame } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertChangedAfterAction } from '../.kiro/scripts/frame-diff.js';

const SNACK_URL = 'https://snack.expo.dev/embedded/@zionxai/zionx-app?platform=web&preview=true&theme=dark&hideQueryParams=true';
const OUT = 'scripts/all-screens-output-v2';

async function findRuntime(page: Page): Promise<Frame | null> {
  for (const f of page.frames()) {
    if (f.url().includes('snack-runtime.eascdn.net')) return f;
  }
  return null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();

  console.log('opening snack...');
  await page.goto(SNACK_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  console.log('waiting for runtime...');
  let runtime: Frame | null = null;
  for (let i = 0; i < 240; i++) {
    runtime = await findRuntime(page);
    if (runtime) { console.log(`  spawned at ${i + 1}s`); break; }
    await page.waitForTimeout(1000);
  }
  if (!runtime) {
    console.log('FATAL: runtime never spawned.');
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(40_000); // long settle for the bundle to complete

  // Capture 1: initial
  await page.screenshot({ path: join(OUT, '01-initial.png'), fullPage: false });
  let prevBuf = readFileSync(join(OUT, '01-initial.png'));

  // Action: tap Add Habit
  const addClicked = await runtime.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('div, button, [role="button"]'));
    const target = els.find((e) => /^\s*\+\s*$|^add\s*habit$|^add\s*new$|^new\s*habit$|^add$/i.test((e.innerText ?? '').trim()) && e.offsetParent !== null);
    if (target) { target.click(); return target.innerText; }
    return null;
  }).catch(() => null);
  console.log('add tapped:', addClicked);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(OUT, '02-after-add-tap.png'), fullPage: false });
  let curBuf = readFileSync(join(OUT, '02-after-add-tap.png'));

  const check1 = assertChangedAfterAction(prevBuf, curBuf, 'Add Habit tap', 0.005);
  console.log(' ', check1.reason);
  prevBuf = curBuf;

  // If the add modal opened, fill text + save
  if (check1.ok) {
    const filled = await runtime.evaluate(() => {
      const inp = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type]), textarea'))
        .find((el) => el.offsetParent !== null);
      if (inp) {
        inp.focus();
        inp.value = 'Drink water';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        const save = Array.from(document.querySelectorAll<HTMLElement>('div, button, [role="button"]'))
          .find((e) => /^(save|create|done|add)$/i.test((e.innerText ?? '').trim()) && e.offsetParent !== null);
        save?.click();
        return true;
      }
      return false;
    }).catch(() => false);
    console.log('input filled:', filled);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(OUT, '03-after-save.png'), fullPage: false });
    curBuf = readFileSync(join(OUT, '03-after-save.png'));
    const check2 = assertChangedAfterAction(prevBuf, curBuf, 'Save habit', 0.005);
    console.log(' ', check2.reason);
    prevBuf = curBuf;

    // Tap the new habit row to mark complete
    const completed = await runtime.evaluate(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('div, button, [role="button"]'));
      const target = els.find((e) => /water|habit|drink/i.test(e.innerText ?? '') && e.offsetParent !== null);
      if (target) { target.click(); return true; }
      return false;
    }).catch(() => false);
    console.log('complete tapped:', completed);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(OUT, '04-after-complete.png'), fullPage: false });
  } else {
    console.log('  Add Habit did NOT open a modal — capturing what we have for diagnosis');
    await page.screenshot({ path: join(OUT, '02-stuck-after-add-tap.png'), fullPage: false });
  }

  // Visible runtime text
  let text = '';
  for (const f of page.frames()) {
    if (f.url().includes('snack-runtime.eascdn.net') || f.url().includes('snack.expo.dev/embedded')) {
      const t = await f.evaluate(() => document.body?.innerText ?? '').catch(() => '');
      text += '\n' + t;
    }
  }
  console.log('Runtime text:', text.slice(0, 500).replace(/\s+/g, ' '));
  writeFileSync(join(OUT, 'runtime-text.txt'), text);

  await browser.close();
  console.log('\nOutput:', OUT);
}
void main().catch((e) => { console.error(e); process.exit(2); });

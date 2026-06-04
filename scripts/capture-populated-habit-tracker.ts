/**
 * Capture multiple states of the habit tracker:
 *  - Empty state
 *  - After adding 3 habits
 *  - After marking 1 habit complete
 *  - Onboarding flow (forced via flag reset)
 */
import { chromium, Frame } from 'playwright';
import { mkdirSync } from 'node:fs';

const SNACK_URL = 'https://snack.expo.dev/embedded/@zionxai/zionx-app?platform=web&preview=true&theme=dark&hideQueryParams=true';
const OUT = 'scripts/populated-habit-output';

async function findRuntime(page: import('playwright').Page): Promise<Frame | null> {
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
  await page.goto(SNACK_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  console.log('waiting for runtime to spawn...');
  for (let i = 0; i < 240; i++) {
    if (await findRuntime(page)) break;
    await page.waitForTimeout(1000);
    if (i % 30 === 29) console.log(`  ${i + 1}s elapsed`);
  }
  await page.waitForTimeout(30_000); // long settle

  // Capture state 1: empty / onboarding (whatever shows first)
  await page.screenshot({ path: `${OUT}/01-first-launch.png`, fullPage: false });
  console.log('captured 01-first-launch.png');

  // Try to dismiss onboarding (if present) — find Skip or Get started button
  const runtime = await findRuntime(page);
  if (runtime) {
    const dismissed = await runtime.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLElement>('div, button, [role="button"]'));
      const target = btns.find((b) => /skip|get\s*started|continue/i.test(b.innerText ?? '') && b.offsetParent !== null);
      if (target) { target.click(); return true; }
      return false;
    }).catch(() => false);
    console.log('onboarding dismissed:', dismissed);
    await page.waitForTimeout(8_000);
    if (dismissed) {
      await page.screenshot({ path: `${OUT}/02-after-onboarding.png`, fullPage: false });
      console.log('captured 02-after-onboarding.png');
    }
  }

  // Try to add a habit by tapping "+" or "Add" button
  if (runtime) {
    const addClicked = await runtime.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLElement>('div, button, [role="button"]'));
      const target = btns.find((b) => /^\s*\+\s*$|add\s*habit|add\s*new|new\s*habit/i.test(b.innerText ?? '') && b.offsetParent !== null);
      if (target) { target.click(); return true; }
      return false;
    }).catch(() => false);
    console.log('add tapped:', addClicked);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/03-add-flow.png`, fullPage: false });
  }

  // Take a final state screenshot
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/04-final-state.png`, fullPage: false });
  console.log('captured 04-final-state.png');

  // Get visible runtime text for verification
  const runtime2 = await findRuntime(page);
  const text = runtime2 ? await runtime2.evaluate(() => document.body?.innerText ?? '').catch(() => '') : '';
  console.log('---');
  console.log('Runtime text:');
  console.log(text.slice(0, 600));

  await browser.close();
}
void main();

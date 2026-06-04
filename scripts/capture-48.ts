/**
 * Capture the 4.8/5 habit tracker — quality gate passed 100/100/100/100.
 */
import { chromium, Page, Frame } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SNACK_URL = 'https://snack.expo.dev/embedded/@zionxai/zionx-app?platform=web&preview=true&theme=dark&hideQueryParams=true';
const OUT = 'scripts/screens-48';

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
  let runtime: Frame | null = null;
  for (let i = 0; i < 240; i++) {
    runtime = await findRuntime(page);
    if (runtime) { console.log(`spawned at ${i + 1}s`); break; }
    await page.waitForTimeout(1000);
  }
  if (!runtime) { console.log('FATAL'); await browser.close(); return; }
  await page.waitForTimeout(60_000);

  await page.screenshot({ path: join(OUT, '01-onboarding-or-today.png'), fullPage: false });
  console.log('captured 01');

  // Try Skip
  await runtime.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('div, button, [role="button"]'));
    const target = els.find((e) => /^(skip|get\s*started|continue|done|next)$/i.test((e.innerText ?? '').trim()) && e.offsetParent !== null);
    target?.click();
  }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.screenshot({ path: join(OUT, '02-today-populated.png'), fullPage: false });
  console.log('captured 02');

  // Try Add
  runtime = (await findRuntime(page)) ?? runtime;
  await runtime.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('div, button, [role="button"]'));
    const target = els.find((e) => /^\+$|add\s*habit|new\s*habit|^add$/i.test((e.innerText ?? '').trim()) && e.offsetParent !== null);
    target?.click();
  }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(OUT, '03-add-modal.png'), fullPage: false });
  console.log('captured 03');

  let text = '';
  for (const f of page.frames()) {
    if (f.url().includes('snack-runtime.eascdn.net')) {
      text = await f.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    }
  }
  writeFileSync(join(OUT, 'runtime.txt'), text);
  console.log('Runtime text:', text.slice(0, 400).replace(/\s+/g, ' '));
  await browser.close();
}
void main().catch((e) => { console.error(e); process.exit(2); });

/**
 * Capture preview screenshot of the quality-pass habit tracker.
 * Project: proj-1780595277785-3ef0e002 (passed quality gate at 95/100)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const SNACK_URL = 'https://snack.expo.dev/embedded/@zionxai/zionx-app?platform=web&preview=true&theme=dark&hideQueryParams=true';
const OUT = 'scripts/quality-pass-output';

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(SNACK_URL, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(60_000); // long wait for runtime to spawn + paint
  await page.screenshot({ path: `${OUT}/QUALITY-PASS-habit-tracker.png`, fullPage: false });

  // Get visible text from the snack runtime
  let runtimeText = '';
  for (const f of page.frames()) {
    if (f.url().includes('snack-runtime.eascdn.net')) {
      runtimeText = await f.evaluate(() => document.body?.innerText ?? '').catch(() => '');
      break;
    }
  }
  console.log('Runtime text:', runtimeText.slice(0, 500));
  await browser.close();
}
void main();

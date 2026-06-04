/**
 * Probe — what's the habit-tracker Snack runtime telling us?
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const SNACK_URL = 'https://snack.expo.dev/embedded/@zionxai/habit-tracker?platform=web&preview=true&theme=dark&hideQueryParams=true';

async function main() {
  mkdirSync('scripts/section-7-output', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  const consoleLog: string[] = [];
  page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
  page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`));

  await page.goto(SNACK_URL, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(45_000);

  // Read all frames
  const frameSummary = page.frames().map((f) => ({ url: f.url().slice(0, 100), name: f.name() }));
  // Get visible text from all snack-domain frames
  let runtimeText = '';
  for (const f of page.frames()) {
    const u = f.url();
    if (u.includes('snack.expo.') || u.includes('eascdn.net') || u.includes('snackager')) {
      try {
        const t = await f.evaluate(() => document.body?.innerText ?? '').catch(() => '');
        runtimeText += `\n=== frame ${u.slice(0, 80)} ===\n${t.slice(0, 1500)}\n`;
      } catch {}
    }
  }

  await page.screenshot({ path: 'scripts/section-7-output/probe-habit-snack.png', fullPage: false });
  writeFileSync('scripts/section-7-output/probe-habit-snack.txt', JSON.stringify({ frameSummary, consoleLog }, null, 2) + '\n\n' + runtimeText);
  console.log('FRAMES:', frameSummary.map((f) => f.url));
  console.log('CONSOLE (first 30 messages):');
  for (const l of consoleLog.slice(0, 30)) console.log(' ', l);
  console.log('\nRUNTIME TEXT:');
  console.log(runtimeText.slice(0, 2000));
  await browser.close();
}
void main();

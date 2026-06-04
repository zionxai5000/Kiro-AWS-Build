/**
 * Capture the actual dashboard Studio view (what King sees in their browser).
 * This shows whether the new 180/320/1fr layout + 1.2x scale gives a usable
 * preview pane, not whether the inner Snack app polished correctly.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DASH = 'http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com';
const OUT = 'scripts/dashboard-view';

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();

  await page.goto(DASH, { waitUntil: 'networkidle' });
  await page.evaluate(`(() => {
    const h = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const p = btoa(JSON.stringify({
      sub: 'k', email: 'k@k', 'cognito:username': 'King',
      'cognito:groups': ['king'], exp: Math.floor(Date.now()/1000)+86400, iat: Math.floor(Date.now()/1000)
    }));
    localStorage.setItem('seraphim_id_token', h + '.' + p + '.x');
    localStorage.setItem('seraphim_access_token', h + '.' + p + '.x');
    localStorage.setItem('seraphim_refresh_token', 'r');
    localStorage.setItem('zionx_studio_project_id', 'proj-1780613494327-c818a4c9');
  })()`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('a.sidebar-link', { timeout: 30_000 });
  await page.click('.sidebar-section-header[data-section="zionx"]').catch(() => {});
  await page.waitForTimeout(500);
  await page.click('a.sidebar-link[data-view="zionx-app-development"]');
  await page.waitForSelector('.studio', { timeout: 30_000 });
  console.log('studio mounted, waiting for preview iframe to spawn...');
  await page.waitForTimeout(60_000);

  await page.screenshot({ path: join(OUT, '01-dashboard-with-preview.png'), fullPage: false });
  console.log('captured');

  // Click Refresh to trigger a fresh preview load
  await page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>('[data-preview-action="refresh"]');
    btn?.click();
  });
  await page.waitForTimeout(45_000);
  await page.screenshot({ path: join(OUT, '02-after-refresh.png'), fullPage: false });
  console.log('captured after refresh');

  await browser.close();
}
void main();

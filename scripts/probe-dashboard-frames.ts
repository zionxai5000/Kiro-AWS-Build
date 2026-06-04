/**
 * Probe — what's in the dashboard preview iframe RIGHT NOW after a fresh
 * habit tracker generation?
 */
import { chromium } from 'playwright';

const DASHBOARD_URL = 'http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || /preview|snack/i.test(t)) console.log(`[browser ${m.type()}]`, t.slice(0, 200));
  });
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
    // Pre-select the latest habit tracker so we go straight to its preview
    localStorage.setItem('zionx_studio_project_id', 'proj-1780542064211-699be2bc');
  })()`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('a.sidebar-link', { timeout: 20_000 });
  await page.click('.sidebar-section-header[data-section="zionx"]').catch(() => {});
  await page.waitForTimeout(500);
  await page.click('a.sidebar-link[data-view="zionx-app-development"]');
  await page.waitForSelector('.studio', { timeout: 20_000 });
  await page.waitForTimeout(8_000);

  // Click the preview action retry/refresh to trigger preview generation
  await page.evaluate(() => {
    const refreshBtn = document.querySelector<HTMLElement>('[data-preview-action="refresh"], [data-preview-action="retry"], [data-preview-action="build-preview"]');
    refreshBtn?.click();
  });

  // Watch the dashboard for 4 minutes and report iframe state every 20s
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(20_000);
    const state = await page.evaluate(() => {
      const iframe = document.querySelector<HTMLIFrameElement>('.studio-device-screen iframe');
      const previewError = document.querySelector<HTMLElement>('[data-preview-error]')?.textContent ?? '';
      const previewStatus = document.querySelector<HTMLElement>('.studio-preview__status')?.textContent ?? '';
      return {
        iframeSrc: iframe?.src.slice(0, 100) ?? 'NONE',
        rect: iframe ? { w: Math.round(iframe.getBoundingClientRect().width), h: Math.round(iframe.getBoundingClientRect().height) } : null,
        previewError: previewError.slice(0, 100),
        previewStatus: previewStatus.slice(0, 100),
      };
    });
    const frames = page.frames().map((f) => f.url().slice(0, 80));
    console.log(`t=${(i + 1) * 20}s`, JSON.stringify(state), 'frames:', frames.length);
    for (const f of frames) console.log('   ', f);
  }

  await page.screenshot({ path: 'scripts/section-7-output/probe-dashboard-frames.png', fullPage: false });
  await browser.close();
}
void main();

/**
 * Probe the actual heights of every container in the chain so I can see
 * WHY the studio is taller than 100vh and the preview gets pushed past
 * the visible area.
 */
import { chromium } from 'playwright';

const DASH = 'http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 800 } }); // match King's likely viewport
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
  })()`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('a.sidebar-link', { timeout: 30_000 });
  await page.click('.sidebar-section-header[data-section="zionx"]').catch(() => {});
  await page.waitForTimeout(500);
  await page.click('a.sidebar-link[data-view="zionx-app-development"]');
  await page.waitForSelector('.studio', { timeout: 20_000 });
  await page.waitForTimeout(8000);

  const probe = await page.evaluate(() => {
    function gather(sel: string) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        sel,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        height: cs.height,
        maxHeight: cs.maxHeight,
        overflow: cs.overflow,
        padding: cs.padding,
      };
    }
    return {
      windowH: window.innerHeight,
      docScrollH: document.documentElement.scrollHeight,
      bodyScrollH: document.body.scrollHeight,
      scrollY: window.scrollY,
      el: {
        body: gather('body'),
        root: gather('#root'),
        nav: gather('nav.top-nav, .top-nav, nav'),
        dashboardView: gather('#dashboard-view'),
        dashboardMain: gather('.dashboard-main'),
        studio: gather('.studio'),
        studioMain: gather('.studio-main'),
        studioPreview: gather('.studio-preview'),
        deviceFrame: gather('.studio-device-frame'),
        iframe: gather('.studio-device-screen iframe'),
      },
    };
  });
  console.log(JSON.stringify(probe, null, 2));
  await browser.close();
}
void main();

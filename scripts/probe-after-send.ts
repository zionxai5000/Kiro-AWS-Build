/**
 * Probe — after sending a habit-tracker example prompt, what's in the sidebar?
 */
import { chromium } from 'playwright';

const DASHBOARD_URL = 'http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || /habit|project/i.test(t)) console.log(`[browser ${m.type()}]`, t.slice(0, 200));
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
    localStorage.removeItem('zionx_studio_project_id');
  })()`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('a.sidebar-link', { timeout: 20_000 });
  await page.click('.sidebar-section-header[data-section="zionx"]').catch(() => {});
  await page.waitForTimeout(500);
  await page.click('a.sidebar-link[data-view="zionx-app-development"]');
  await page.waitForSelector('.studio', { timeout: 20_000 });
  await page.waitForTimeout(2500);

  // Click the habit tracker example
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll<HTMLElement>('[data-example-prompt]'));
    const habit = btns.find((b) => b.textContent?.toLowerCase().includes('habit'));
    if (habit) {
      habit.click();
      return true;
    }
    return false;
  });
  console.log('clicked habit example:', clicked);

  // Watch for 30s and report state every 5s
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    const state = await page.evaluate(() => {
      const projects = Array.from(document.querySelectorAll<HTMLElement>('.studio-project__name')).map((el) => el.textContent?.trim() ?? '');
      const projectId = localStorage.getItem('zionx_studio_project_id');
      const messages = Array.from(document.querySelectorAll<HTMLElement>('.studio-msg')).map((el) => el.textContent?.slice(0, 80) ?? '');
      const tabs = Array.from(document.querySelectorAll<HTMLElement>('.studio-tab')).map((el) => el.textContent?.trim() ?? '');
      return { projects, projectId, messages: messages.slice(-3), tabs };
    });
    console.log(`t=${(i + 1) * 5}s`, JSON.stringify(state));
  }

  await page.screenshot({ path: 'scripts/section-7-output/probe-after-send.png', fullPage: false });
  await browser.close();
}
void main();

/**
 * Probe — does the empty-state hero render in the deployed dashboard?
 */
import { chromium } from 'playwright';

const DASHBOARD_URL = 'http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
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
  await page.waitForTimeout(3000);

  const probe = await page.evaluate(() => {
    const messages = document.querySelector('.studio-messages');
    const examples = Array.from(document.querySelectorAll('[data-example-prompt]'));
    const projectStored = localStorage.getItem('zionx_studio_project_id');
    const projectsCount = document.querySelectorAll('.studio-project').length;
    const heroPresent = !!document.querySelector('.studio-empty-hero');
    return {
      heroPresent,
      examplesCount: examples.length,
      projectStored,
      projectsCount,
      messagesHTML: messages?.innerHTML.slice(0, 500) ?? null,
    };
  });
  console.log(JSON.stringify(probe, null, 2));
  await page.screenshot({ path: 'scripts/section-7-output/probe-empty.png', fullPage: false });
  await browser.close();
}
void main();

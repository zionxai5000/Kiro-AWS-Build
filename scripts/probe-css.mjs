import { chromium } from 'playwright';
const DASH = 'http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 800 } });
const page = await ctx.newPage();
await page.goto(DASH, { waitUntil: 'networkidle' });
await page.evaluate(`(() => {
  const h = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = btoa(JSON.stringify({ sub: 'k', email: 'k@k', 'cognito:username': 'King', 'cognito:groups': ['king'], exp: Math.floor(Date.now()/1000)+86400, iat: Math.floor(Date.now()/1000) }));
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
await page.waitForTimeout(5000);

const result = await page.evaluate(`(() => {
  const dm = document.querySelector('.dashboard-main');
  const dv = document.querySelector('#dashboard-view');
  const html = document.documentElement;
  const body = document.body;
  return {
    'html.height': getComputedStyle(html).height,
    'html.overflow': getComputedStyle(html).overflow,
    'body.height': getComputedStyle(body).height,
    'body.overflow': getComputedStyle(body).overflow,
    'dashView.height': dv ? getComputedStyle(dv).height : null,
    'dashView.overflow': dv ? getComputedStyle(dv).overflow : null,
    'dashMain.height': dm ? getComputedStyle(dm).height : null,
    'dashMain.maxHeight': dm ? getComputedStyle(dm).maxHeight : null,
    'dashMain.overflow': dm ? getComputedStyle(dm).overflow : null,
    'has() supported?': CSS.supports('selector(:has(*))'),
  };
})()`);
console.log(JSON.stringify(result, null, 2));
await browser.close();

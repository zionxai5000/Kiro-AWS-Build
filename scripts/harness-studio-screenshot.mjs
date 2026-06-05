import { chromium } from 'playwright';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'scripts', 'harness-e2e-output');
const FILE = 'file:///' + join(process.cwd(), 'scripts', 'harness-studio-static-mock.html').replace(/\\/g, '/');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

console.log(`opening ${FILE}`);
await page.goto(FILE, { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, '00-studio-3-column.png'), fullPage: false });
console.log('saved 00-studio-3-column.png');

await browser.close();
console.log('done');

/**
 * Authenticated dashboard probe.
 *
 * Logs in via Cognito → injects tokens into localStorage → loads the
 * dashboard at the bare URL → confirms the legacy nav is present →
 * navigates to "App Development" → confirms the harness studio mounts.
 *
 * Captures screenshots + console errors at each step.
 */
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DASH = 'http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com';
const COGNITO_REGION = 'us-east-1';
const POOL_ID = 'us-east-1_Sk7yrXhSI';
const CLIENT_ID = '77p41spm5d420kdg6ut9c6f4u1';
const USERNAME = 'king';
const PW = (await readFile(join(process.cwd(), '.probe-pw'), 'utf-8')).trim();

const OUT = join(process.cwd(), 'scripts', 'authenticated-probe-output');
await mkdir(OUT, { recursive: true });

// 1. Cognito InitiateAuth (USER_PASSWORD_AUTH).
console.log('[probe] authenticating via Cognito...');
const authBody = {
  AuthFlow: 'USER_PASSWORD_AUTH',
  ClientId: CLIENT_ID,
  AuthParameters: { USERNAME, PASSWORD: PW },
};
const authResp = await fetch(`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
  },
  body: JSON.stringify(authBody),
});
if (!authResp.ok) {
  const t = await authResp.text();
  console.error(`[probe] auth failed: ${authResp.status} ${t}`);
  process.exit(1);
}
const auth = await authResp.json();
const tokens = auth.AuthenticationResult;
console.log(`[probe]   authenticated (idToken length ${tokens.IdToken.length})`);

// 2. Launch a real browser with localStorage seeded.
console.log('[probe] launching browser...');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(e.message));

// Seed tokens BEFORE navigating to the page so ensureAuthenticated() finds them.
await page.addInitScript((data) => {
  localStorage.setItem('seraphim_id_token', data.idToken);
  localStorage.setItem('seraphim_access_token', data.accessToken);
  localStorage.setItem('seraphim_refresh_token', data.refreshToken);
}, { idToken: tokens.IdToken, accessToken: tokens.AccessToken, refreshToken: tokens.RefreshToken });

// 3. Load the bare dashboard URL.
console.log('[probe] loading bare dashboard URL...');
await page.goto(`${DASH}/`, { timeout: 30_000, waitUntil: 'networkidle' }).catch((e) => console.warn(`  goto: ${e.message}`));
await page.waitForTimeout(3000);
await page.screenshot({ path: join(OUT, '01-bare-url-default.png'), fullPage: false });

// 4. Confirm the legacy dashboard mounts (nav with all the tabs).
const navState = await page.evaluate(() => {
  const navItems = Array.from(document.querySelectorAll('a[data-view], [class*="nav"] a')).map((a) => ({
    text: a.textContent?.trim().slice(0, 40),
    view: a.getAttribute('data-view'),
  })).filter((n) => n.view).slice(0, 30);
  const visibleHeading = document.querySelector('h1, h2')?.textContent?.trim();
  const hasHarness = !!document.querySelector('.harness-studio') || /harness-studio/.test(document.documentElement.innerHTML);
  return { navItems, visibleHeading, hasHarness };
});
console.log(`[probe]   visible heading: ${navState.visibleHeading}`);
console.log(`[probe]   nav items found: ${navState.navItems.length}`);
console.log(`[probe]   harness mounted on bare URL: ${navState.hasHarness}`);
if (navState.navItems.length > 0) {
  console.log('[probe]   sample nav items:');
  navState.navItems.slice(0, 8).forEach((n) => console.log(`     - [${n.view}] ${n.text}`));
}

// 5. Navigate to the App Development tab.
console.log('[probe] navigating to App Development tab...');
const navResult = await page.evaluate(() => {
  const link = document.querySelector('a[data-view="zionx-app-development"]');
  if (!link) return { found: false };
  link.click();
  return { found: true, text: link.textContent?.trim() };
});
console.log(`[probe]   click result: ${JSON.stringify(navResult)}`);
await page.waitForTimeout(4000); // let lazy chunk + boot retry resolve
await page.screenshot({ path: join(OUT, '02-app-development-tab.png'), fullPage: false });

// 6. Confirm the harness mounted INSIDE the dashboard chrome.
const harnessState = await page.evaluate(() => {
  const has3col = !!document.querySelector('.harness-studio') || !!document.querySelector('[class*="harness-studio__"]');
  const navStillVisible = !!document.querySelector('a[data-view="kings-view"]');
  const errorVisible = /Failed to load projects|HTTP 503/.test(document.body.innerText);
  const loadingVisible = /Loading projects/.test(document.body.innerText);
  return { has3col, navStillVisible, errorVisible, loadingVisible, bodyTextHead: document.body.innerText.slice(0, 400) };
});
console.log(`[probe]   harness 3-column rendered: ${harnessState.has3col}`);
console.log(`[probe]   dashboard nav still visible: ${harnessState.navStillVisible}`);
console.log(`[probe]   error visible: ${harnessState.errorVisible}`);
console.log(`[probe]   loading state shown: ${harnessState.loadingVisible}`);
console.log(`[probe]   body preview: ${harnessState.bodyTextHead.replace(/\s+/g, ' ').slice(0, 200)}`);

// 7. Wait a bit longer (give boot-retry time to fully complete) and re-snapshot.
await page.waitForTimeout(5000);
await page.screenshot({ path: join(OUT, '03-after-retry.png'), fullPage: false });
const finalState = await page.evaluate(() => ({
  errorVisible: /Failed to load projects|HTTP 503/.test(document.body.innerText),
  bodyTextHead: document.body.innerText.slice(0, 400),
}));
console.log(`[probe]   final state — error visible: ${finalState.errorVisible}`);

await writeFile(join(OUT, 'results.json'), JSON.stringify({
  bareUrl: navState,
  appDev: harnessState,
  final: finalState,
  consoleErrors,
  pageErrors,
}, null, 2), 'utf-8');

await browser.close();

// Verdict
const passed =
  navState.navItems.length >= 5 &&
  !navState.hasHarness && // bare URL is legacy
  navResult.found &&
  harnessState.has3col &&
  harnessState.navStillVisible &&
  !finalState.errorVisible;

console.log(`\n[probe] ${passed ? 'PASS' : 'FAIL'}`);
console.log(`[probe]   bare URL = legacy with full nav: ${navState.navItems.length >= 5 && !navState.hasHarness}`);
console.log(`[probe]   App Development tab mounts harness: ${navResult.found && harnessState.has3col}`);
console.log(`[probe]   dashboard chrome preserved: ${harnessState.navStillVisible}`);
console.log(`[probe]   no 503 error after retry window: ${!finalState.errorVisible}`);
console.log(`[probe]   console errors: ${consoleErrors.length}, page errors: ${pageErrors.length}`);
process.exit(passed ? 0 : 1);

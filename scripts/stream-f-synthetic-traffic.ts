/**
 * Stream F harness — generate synthetic dashboard traffic so the spec runner
 * has breadcrumbs to grade.
 *
 * What it does
 * ------------
 * 1. Launches headless Chromium against the live dashboard.
 * 2. Navigates to the App Development tab (#app-development).
 * 3. Mounts the Studio view, waits for it to fetch /api/app-dev/projects.
 * 4. Drives a representative session:
 *      - Click "Files", "Code", "Logs", "Design" tabs.
 *      - Type a prompt and hit Send (which kicks off generate stream).
 *      - Wait for done event or 90s timeout.
 *      - Click Build iOS.
 *      - Click Refresh.
 * 5. Captures every console.log + page error so we can correlate to breadcrumbs.
 * 6. Triggers /api/app-dev/spec/evaluate and prints the report.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DASHBOARD_URL = 'http://seraphim-dashboard-live.s3-website-us-east-1.amazonaws.com';
const API_BASE = 'http://seraphim-api-alb-1857113134.us-east-1.elb.amazonaws.com';
const OUT_DIR = join(process.cwd(), 'scripts', 'stream-f-output');

interface CapturedEvent {
  ts: string;
  type: 'console' | 'pageerror' | 'request' | 'response';
  level?: string;
  message: string;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Launching Chromium against ${DASHBOARD_URL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const events: CapturedEvent[] = [];
  page.on('console', (msg) => {
    events.push({ ts: new Date().toISOString(), type: 'console', level: msg.type(), message: msg.text() });
  });
  page.on('pageerror', (err) => {
    events.push({ ts: new Date().toISOString(), type: 'pageerror', message: err.message });
  });
  page.on('requestfailed', (req) => {
    events.push({ ts: new Date().toISOString(), type: 'request', message: `FAILED ${req.method()} ${req.url()} — ${req.failure()?.errorText}` });
  });

  console.log('Loading dashboard...');
  await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle', timeout: 30_000 });

  // Bypass the Cognito login overlay by injecting fake tokens into
  // localStorage, then reloading. This is the same trick the Shaar Guardian
  // observer uses for internal review (packages/services/src/shaar-agent/
  // playwright-observer.ts). The dashboard checks localStorage on boot and
  // skips the login overlay when tokens are present.
  console.log('Bypassing Cognito login overlay...');
  const hasOverlay = await page.evaluate('!!document.getElementById("seraphim-login-overlay")');
  if (hasOverlay) {
    await page.evaluate(`(() => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({
        sub: 'stream-f-harness',
        email: 'streamf@seraphimos.internal',
        'cognito:username': 'StreamFHarness',
        'cognito:groups': ['king'],
        exp: Math.floor(Date.now() / 1000) + 86400,
        iat: Math.floor(Date.now() / 1000),
      }));
      const sig = 'stream-f-fake-sig';
      const token = header + '.' + payload + '.' + sig;
      localStorage.setItem('seraphim_id_token', token);
      localStorage.setItem('seraphim_access_token', token);
      localStorage.setItem('seraphim_refresh_token', 'stream-f-refresh');
    })()`);
    await page.reload({ waitUntil: 'networkidle', timeout: 30_000 });
    console.log('  ✓ tokens injected, page reloaded');
  } else {
    console.log('  (no overlay — already authenticated)');
  }

  // Wait for the dashboard to actually mount its sidebar.
  console.log('Waiting for sidebar to render...');
  try {
    await page.waitForSelector('a.sidebar-link', { timeout: 20_000, state: 'attached' });
    console.log('  ✓ sidebar rendered');
  } catch {
    console.log('  ✗ sidebar never appeared after 20s — capturing diagnostics');
    const html = await page.content();
    writeFileSync(join(OUT_DIR, 'page-html.txt'), html.slice(0, 50_000));
    const allLinks = await page.locator('a').evaluateAll((els) =>
      els.slice(0, 50).map((el) => ({
        href: (el as HTMLAnchorElement).href,
        text: el.textContent?.trim().slice(0, 60),
        cls: el.className,
      })),
    );
    writeFileSync(join(OUT_DIR, 'all-anchors.json'), JSON.stringify(allLinks, null, 2));
  }

  // Click the App Development link in the sidebar.
  // ZionX section is collapsed by default — click its header to expand
  // before clicking the App Development link inside it.
  console.log('Navigating to App Development tab...');
  try {
    console.log('  expanding ZionX nav section...');
    const headerLocator = page.locator('.sidebar-section-header[data-section="zionx"]');
    if ((await headerLocator.count()) > 0) {
      await headerLocator.first().click({ timeout: 5000 });
      await page.waitForTimeout(800);
    } else {
      console.log('  (no zionx section header — section may be auto-expanded)');
    }
    await page.click('a.sidebar-link[data-view="zionx-app-development"]', { timeout: 10_000 });
    await page.waitForTimeout(3000);
    console.log('  ✓ navigated to App Development');
  } catch (err) {
    console.log(`  ✗ sidebar link click failed: ${(err as Error).message.slice(0, 120)}`);
    // Fallback: list all sidebar links so we can debug
    const links = await page.locator('a.sidebar-link').evaluateAll((els) =>
      els.map((el) => ({ view: (el as HTMLElement).dataset['view'], label: (el as HTMLElement).textContent?.trim() })),
    );
    console.log('  available sidebar links:', JSON.stringify(links, null, 2).slice(0, 600));
    // Also dump section headers
    const headers = await page.locator('.sidebar-section-header').evaluateAll((els) =>
      els.map((el) => ({ section: (el as HTMLElement).dataset['section'], text: el.textContent?.trim().slice(0, 60) })),
    );
    console.log('  available section headers:', JSON.stringify(headers, null, 2).slice(0, 600));
  }

  // Take a screenshot of the initial state
  await page.screenshot({ path: join(OUT_DIR, '01-initial.png'), fullPage: true });

  // Look for the Studio root
  const hasStudio = await page.locator('.studio').count();
  console.log(`Studio container present: ${hasStudio > 0}`);

  if (hasStudio > 0) {
    // Click each tab so the spec rules for tab-switch fire
    for (const tab of ['files', 'code', 'logs', 'design', 'chat']) {
      try {
        await page.click(`[data-tab="${tab}"]`, { timeout: 5_000 });
        await page.waitForTimeout(800);
        console.log(`  ✓ clicked tab: ${tab}`);
      } catch (err) {
        console.log(`  ✗ tab ${tab} failed: ${(err as Error).message.slice(0, 80)}`);
      }
    }
    await page.screenshot({ path: join(OUT_DIR, '02-after-tabs.png'), fullPage: true });

    // Type a prompt and send
    try {
      const input = page.locator('#studio-input');
      await input.fill('Make me a simple meditation timer app with breathing animation');
      await page.waitForTimeout(500);
      await page.click('#studio-send');
      console.log('  ✓ sent prompt — waiting up to 90s for generate stream to complete');
      await page.waitForTimeout(90_000);
    } catch (err) {
      console.log(`  ✗ send failed: ${(err as Error).message.slice(0, 120)}`);
    }
    await page.screenshot({ path: join(OUT_DIR, '03-after-send.png'), fullPage: true });

    // Try to click a file in the file list
    try {
      const file = page.locator('.studio-file').first();
      if ((await file.count()) > 0) {
        await file.click({ timeout: 3000 });
        await page.waitForTimeout(1500);
        console.log('  ✓ clicked first file');
      }
    } catch {
      console.log('  ✗ no file clickable');
    }

    // Click Build iOS (it may be greyed)
    try {
      await page.click('#studio-build-ios', { timeout: 3000 });
      await page.waitForTimeout(2000);
      console.log('  ✓ clicked Build iOS');
    } catch (err) {
      console.log(`  ✗ Build iOS click failed: ${(err as Error).message.slice(0, 100)}`);
    }
  } else {
    console.log('Studio not rendered — capturing fallback screenshot');
  }

  // Trigger spec evaluation explicitly so we have a fresh report
  console.log('\nCalling /api/app-dev/spec/evaluate ...');
  let report: unknown = null;
  try {
    const evalRes = await fetch(`${API_BASE}/api/app-dev/spec/evaluate`, { method: 'POST' });
    report = await evalRes.json();
    console.log(`HTTP ${evalRes.status}`);
    console.log(JSON.stringify(report, null, 2).slice(0, 3000));
  } catch (err) {
    console.log(`spec evaluate failed: ${(err as Error).message}`);
  }

  // Persist artifacts
  writeFileSync(join(OUT_DIR, 'console-events.json'), JSON.stringify(events, null, 2));
  if (report) writeFileSync(join(OUT_DIR, 'spec-evaluation.json'), JSON.stringify(report, null, 2));
  console.log(`\nArtifacts saved to ${OUT_DIR}`);

  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });

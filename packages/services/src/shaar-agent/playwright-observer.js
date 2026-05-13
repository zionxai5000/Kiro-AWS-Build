"use strict";
/**
 * Shaar Agent — Playwright Browser Observer
 *
 * Real browser-based dashboard observation using Playwright.
 * Launches headless Chromium to render the React SPA, navigate tabs,
 * capture screenshots, inspect the rendered DOM, and capture console errors.
 *
 * This is the production observer for local dev and environments where
 * a real browser is available. For CI/ECS without a browser, use the
 * HTTP-based BrowserObserver instead.
 *
 * NOTE: Playwright is imported dynamically so this module can be loaded
 * in environments where playwright is not installed (e.g., CI running
 * unit tests against the HTTP-based BrowserObserver).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlaywrightObserver = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
class PlaywrightObserver {
    config;
    browser = null;
    context = null;
    page = null;
    observations = new Map();
    consoleErrors = [];
    screenshotDir;
    navigationTimeout;
    tabRenderTimeout;
    constructor(config) {
        this.config = config;
        this.screenshotDir = config.screenshotDir || './screenshots/shaar-agent/';
        this.navigationTimeout = config.navigationTimeout || 30000;
        this.tabRenderTimeout = config.tabRenderTimeout || 5000;
    }
    // ---------------------------------------------------------------------------
    // Browser Lifecycle
    // ---------------------------------------------------------------------------
    /**
     * Dynamically import playwright. Throws a clear error if not installed.
     */
    async getPlaywright() {
        try {
            return await import('playwright');
        }
        catch {
            throw new Error('Playwright is not installed. Install it with: npm install playwright && npx playwright install chromium');
        }
    }
    /**
     * Ensure the browser is launched. Reuses existing session if available.
     */
    async ensureBrowser() {
        if (this.page && this.browser?.isConnected()) {
            return this.page;
        }
        const { chromium } = await this.getPlaywright();
        // Launch a new browser session
        this.browser = await chromium.launch({ headless: true });
        this.context = await this.browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'ShaarGuardian/1.0 (SeraphimOS Playwright Observer)',
        });
        this.page = await this.context.newPage();
        // Capture console errors
        this.page.on('console', (msg) => {
            if (msg.type() === 'error') {
                this.consoleErrors.push(`[console.error] ${msg.text()}`);
            }
        });
        this.page.on('pageerror', (error) => {
            this.consoleErrors.push(`[pageerror] ${error.message}`);
        });
        // Navigate to the dashboard
        await this.page.goto(this.config.dashboardUrl, {
            waitUntil: 'domcontentloaded',
            timeout: this.navigationTimeout,
        });
        // Wait for the SPA to render — look for the app container or sidebar
        try {
            await this.page.waitForSelector('.sidebar, [data-view], #app, #root, main', {
                timeout: this.tabRenderTimeout,
            });
        }
        catch {
            // SPA might use different selectors — wait a bit for JS to execute
            await this.page.waitForTimeout(3000);
        }
        // Handle login overlay — bypass authentication for internal observation
        await this.bypassLogin();
        return this.page;
    }
    /**
     * Bypass the login overlay for internal Shaar Agent observation.
     * Sets fake tokens in localStorage then reloads the page so the
     * dashboard's ensureAuthenticated() check passes and the app initializes.
     */
    async bypassLogin() {
        if (!this.page)
            return;
        const hasLoginOverlay = await this.page.evaluate(`
      !!document.getElementById('seraphim-login-overlay')
    `);
        if (!hasLoginOverlay)
            return; // No login gate — already authenticated
        // Inject mock tokens into localStorage
        await this.page.evaluate(`
      (() => {
        const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
        const payload = btoa(JSON.stringify({
          sub: 'shaar-guardian-internal',
          email: 'shaar@seraphimos.internal',
          'cognito:username': 'ShaarGuardian',
          exp: Math.floor(Date.now() / 1000) + 86400,
          iat: Math.floor(Date.now() / 1000),
          'custom:role': 'king',
          'custom:tenant_id': 'system',
        }));
        const signature = btoa('shaar-guardian-internal-observation');
        const token = header + '.' + payload + '.' + signature;

        localStorage.setItem('seraphim_id_token', token);
        localStorage.setItem('seraphim_access_token', token);
        localStorage.setItem('seraphim_refresh_token', 'shaar-guardian-refresh');
      })()
    `);
        // Reload the page — now ensureAuthenticated() will find tokens and skip login
        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: this.navigationTimeout });
        // Wait for the app to fully render after auth bypass
        try {
            await this.page.waitForSelector('.sidebar, [data-view], .app-container, .dashboard', {
                timeout: this.tabRenderTimeout,
            });
        }
        catch {
            // Give extra time for JS to execute
            await this.page.waitForTimeout(3000);
        }
    }
    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------
    /**
     * Navigate to a specific tab/view and return a full observation.
     * For SPA navigation, clicks the sidebar link with the matching data-view attribute.
     */
    async observePage(path = '/') {
        const page = await this.ensureBrowser();
        const startTime = Date.now();
        try {
            // Navigate to the view by clicking the sidebar link
            if (path !== '/') {
                const viewName = path.startsWith('/') ? path.slice(1) : path;
                const selector = `[data-view="${viewName}"]`;
                // Wait for the sidebar link to be available and click it
                try {
                    await page.waitForSelector(selector, { timeout: this.tabRenderTimeout });
                    await page.click(selector);
                }
                catch {
                    // Try alternative: look for link text or partial match
                    const altSelector = `a:has-text("${viewName}"), button:has-text("${viewName}")`;
                    try {
                        await page.click(altSelector, { timeout: 2000 });
                    }
                    catch {
                        // Navigation target not found — continue with current page
                        this.consoleErrors.push(`[navigation] Could not find tab: ${viewName}`);
                    }
                }
                // Wait for the content to render after navigation
                await page.waitForTimeout(1000); // Pause for React re-render
                try {
                    await page.waitForLoadState('networkidle', { timeout: 5000 });
                }
                catch {
                    // networkidle timeout is OK — page might have long-polling
                }
            }
            // Extract the rendered DOM using a string-based evaluate to avoid
            // TypeScript/esbuild __name decorator issues in the browser context
            const { title, html, elements } = await page.evaluate(`
        (() => {
          function extractElements(node, depth) {
            if (depth > 5) return [];
            const elements = [];
            const children = Array.from(node.children);
            for (const child of children) {
              const el = {
                tag: child.tagName.toLowerCase(),
                id: child.id || undefined,
                classes: Array.from(child.classList),
                text: (child.textContent || '').trim().substring(0, 200) || undefined,
                attributes: {},
                children: extractElements(child, depth + 1),
                role: child.getAttribute('role') || undefined,
                ariaLabel: child.getAttribute('aria-label') || undefined,
              };
              for (const attr of child.attributes) {
                if (['id', 'class', 'style'].includes(attr.name)) continue;
                el.attributes[attr.name] = attr.value;
              }
              elements.push(el);
            }
            return elements;
          }
          return {
            title: document.title,
            html: document.documentElement.outerHTML,
            elements: extractElements(document.body, 0),
          };
        })()
      `);
            const loadTimeMs = Date.now() - startTime;
            const url = `${this.config.dashboardUrl}${path === '/' ? '' : '#' + path}`;
            const observation = {
                url,
                title,
                html,
                timestamp: new Date().toISOString(),
                elements,
                consoleErrors: [...this.consoleErrors],
                loadTimeMs,
            };
            this.observations.set(path, observation);
            return observation;
        }
        catch (error) {
            const loadTimeMs = Date.now() - startTime;
            const errorMsg = error.message;
            return {
                url: `${this.config.dashboardUrl}${path}`,
                title: 'Error',
                html: '',
                timestamp: new Date().toISOString(),
                elements: [],
                consoleErrors: [`Failed to observe page: ${errorMsg}`, ...this.consoleErrors],
                loadTimeMs,
            };
        }
    }
    /**
     * Read the sidebar navigation from the rendered DOM.
     */
    async getNavigation() {
        const page = await this.ensureBrowser();
        return page.evaluate(`
      (() => {
        const items = [];
        const navLinks = document.querySelectorAll('[data-view]');
        for (const link of navLinks) {
          items.push({
            label: (link.textContent || '').trim(),
            href: link.getAttribute('data-view') || undefined,
            isActive: link.classList.contains('active') ||
                      link.getAttribute('aria-current') === 'page',
            children: [],
          });
        }
        if (items.length === 0) {
          const anchors = document.querySelectorAll('nav a[href]');
          for (const anchor of anchors) {
            items.push({
              label: (anchor.textContent || '').trim(),
              href: anchor.getAttribute('href') || undefined,
              isActive: anchor.classList.contains('active'),
              children: [],
            });
          }
        }
        return items;
      })()
    `);
    }
    /**
     * Return all navigable views from the sidebar.
     */
    async getAvailablePages() {
        const nav = await this.getNavigation();
        const pages = ['/'];
        for (const item of nav) {
            if (item.href) {
                pages.push(item.href);
            }
            for (const child of item.children) {
                if (child.href) {
                    pages.push(child.href);
                }
            }
        }
        return pages;
    }
    /**
     * Observe every navigable page and return all observations.
     */
    async observeAllPages() {
        const pages = await this.getAvailablePages();
        for (const page of pages) {
            await this.observePage(page);
        }
        return this.observations;
    }
    /**
     * Get the cached observation for a page.
     */
    getLastObservation(path) {
        return this.observations.get(path);
    }
    /**
     * Use page.$$eval() to extract elements matching a real CSS selector
     * from the rendered DOM.
     */
    async extractElements(selector) {
        const page = await this.ensureBrowser();
        return page.$$eval(selector, (nodes) => {
            return nodes.map((node) => ({
                tag: node.tagName.toLowerCase(),
                id: node.id || undefined,
                classes: Array.from(node.classList),
                text: node.textContent?.trim().substring(0, 200) || undefined,
                attributes: Object.fromEntries(Array.from(node.attributes)
                    .filter((a) => !['id', 'class', 'style'].includes(a.name))
                    .map((a) => [a.name, a.value])),
                children: [],
                role: node.getAttribute('role') || undefined,
                ariaLabel: node.getAttribute('aria-label') || undefined,
            }));
        });
    }
    /**
     * Take a screenshot and save it to the configured directory.
     * Returns the file path of the saved screenshot.
     */
    async captureScreenshot(filename) {
        const page = await this.ensureBrowser();
        // Ensure screenshot directory exists
        const dir = (0, path_1.resolve)(this.screenshotDir);
        if (!(0, fs_1.existsSync)(dir)) {
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        }
        const name = filename || `screenshot-${Date.now()}.png`;
        const filePath = (0, path_1.join)(dir, name);
        await page.screenshot({ path: filePath, fullPage: true });
        return filePath;
    }
    /**
     * Click an element matching the given CSS selector.
     */
    async clickElement(selector) {
        const page = await this.ensureBrowser();
        await page.waitForSelector(selector, { timeout: this.tabRenderTimeout });
        await page.click(selector);
        // Wait for any resulting re-render
        await page.waitForTimeout(300);
    }
    /**
     * Fill an input element with text.
     */
    async fillInput(selector, value) {
        const page = await this.ensureBrowser();
        await page.waitForSelector(selector, { timeout: this.tabRenderTimeout });
        await page.fill(selector, value);
    }
    /**
     * Get computed CSS styles for elements matching a selector.
     * Useful for design evaluation (colors, spacing, typography).
     */
    async getComputedStyles(selector) {
        const page = await this.ensureBrowser();
        return page.$$eval(selector, (nodes) => {
            return nodes.map((node) => {
                const computed = window.getComputedStyle(node);
                return {
                    color: computed.color,
                    backgroundColor: computed.backgroundColor,
                    fontSize: computed.fontSize,
                    fontWeight: computed.fontWeight,
                    fontFamily: computed.fontFamily,
                    lineHeight: computed.lineHeight,
                    padding: computed.padding,
                    margin: computed.margin,
                    display: computed.display,
                    position: computed.position,
                    width: computed.width,
                    height: computed.height,
                    borderRadius: computed.borderRadius,
                    boxShadow: computed.boxShadow,
                    opacity: computed.opacity,
                    overflow: computed.overflow,
                };
            });
        });
    }
    /**
     * Return all captured console errors from the browser session.
     */
    getConsoleErrors() {
        return [...this.consoleErrors];
    }
    /**
     * Close the browser and clean up resources.
     */
    async dispose() {
        if (this.page) {
            await this.page.close().catch(() => { });
            this.page = null;
        }
        if (this.context) {
            await this.context.close().catch(() => { });
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close().catch(() => { });
            this.browser = null;
        }
        this.consoleErrors = [];
        this.observations.clear();
    }
}
exports.PlaywrightObserver = PlaywrightObserver;
//# sourceMappingURL=playwright-observer.js.map
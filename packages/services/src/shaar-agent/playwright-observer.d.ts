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
import type { PageObservation, DOMElement, NavigationItem, BrowserObserverConfig } from './browser-observer.js';
export interface PlaywrightObserverConfig extends BrowserObserverConfig {
    /** Directory to save screenshots. Default: ./screenshots/shaar-agent/ */
    screenshotDir?: string;
    /** Timeout for page navigation in ms. Default: 30000 */
    navigationTimeout?: number;
    /** Timeout for waiting after tab click in ms. Default: 5000 */
    tabRenderTimeout?: number;
}
export declare class PlaywrightObserver {
    private config;
    private browser;
    private context;
    private page;
    private observations;
    private consoleErrors;
    private screenshotDir;
    private navigationTimeout;
    private tabRenderTimeout;
    constructor(config: PlaywrightObserverConfig);
    /**
     * Dynamically import playwright. Throws a clear error if not installed.
     */
    private getPlaywright;
    /**
     * Ensure the browser is launched. Reuses existing session if available.
     */
    private ensureBrowser;
    /**
     * Bypass the login overlay for internal Shaar Agent observation.
     * Sets fake tokens in localStorage then reloads the page so the
     * dashboard's ensureAuthenticated() check passes and the app initializes.
     */
    private bypassLogin;
    /**
     * Navigate to a specific tab/view and return a full observation.
     * For SPA navigation, clicks the sidebar link with the matching data-view attribute.
     */
    observePage(path?: string): Promise<PageObservation>;
    /**
     * Read the sidebar navigation from the rendered DOM.
     */
    getNavigation(): Promise<NavigationItem[]>;
    /**
     * Return all navigable views from the sidebar.
     */
    getAvailablePages(): Promise<string[]>;
    /**
     * Observe every navigable page and return all observations.
     */
    observeAllPages(): Promise<Map<string, PageObservation>>;
    /**
     * Get the cached observation for a page.
     */
    getLastObservation(path: string): PageObservation | undefined;
    /**
     * Use page.$$eval() to extract elements matching a real CSS selector
     * from the rendered DOM.
     */
    extractElements(selector: string): Promise<DOMElement[]>;
    /**
     * Take a screenshot and save it to the configured directory.
     * Returns the file path of the saved screenshot.
     */
    captureScreenshot(filename?: string): Promise<string>;
    /**
     * Click an element matching the given CSS selector.
     */
    clickElement(selector: string): Promise<void>;
    /**
     * Fill an input element with text.
     */
    fillInput(selector: string, value: string): Promise<void>;
    /**
     * Get computed CSS styles for elements matching a selector.
     * Useful for design evaluation (colors, spacing, typography).
     */
    getComputedStyles(selector: string): Promise<Record<string, string>[]>;
    /**
     * Return all captured console errors from the browser session.
     */
    getConsoleErrors(): string[];
    /**
     * Close the browser and clean up resources.
     */
    dispose(): Promise<void>;
}
//# sourceMappingURL=playwright-observer.d.ts.map
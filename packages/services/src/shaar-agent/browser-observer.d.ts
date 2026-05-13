/**
 * Shaar Agent — Browser Observer Service
 *
 * Provides dashboard observation capabilities for the Shaar Guardian agent.
 * Uses HTTP fetch to retrieve dashboard HTML and parse DOM structure.
 * On environments with Playwright available (local dev), can take real screenshots.
 *
 * For ECS deployment: uses HTML fetch + DOM parsing (no browser needed).
 * For local dev: can optionally use Playwright for full screenshot capture.
 */
export interface PageObservation {
    url: string;
    title: string;
    html: string;
    timestamp: string;
    elements: DOMElement[];
    consoleErrors: string[];
    loadTimeMs: number;
    screenshotKey?: string;
}
export interface DOMElement {
    tag: string;
    id?: string;
    classes: string[];
    text?: string;
    attributes: Record<string, string>;
    children: DOMElement[];
    role?: string;
    ariaLabel?: string;
}
export interface NavigationItem {
    label: string;
    href?: string;
    isActive: boolean;
    children: NavigationItem[];
}
export interface BrowserObserverConfig {
    dashboardUrl: string;
    s3Bucket?: string;
    usePlaywright?: boolean;
}
export declare class BrowserObserver {
    private config;
    private observations;
    constructor(config: BrowserObserverConfig);
    /**
     * Fetch and parse a dashboard page via HTTP.
     * Returns structured DOM observation without needing a real browser.
     */
    observePage(path?: string): Promise<PageObservation>;
    /**
     * Get the navigation structure of the dashboard.
     */
    getNavigation(): Promise<NavigationItem[]>;
    /**
     * Get all pages available in the dashboard.
     */
    getAvailablePages(): Promise<string[]>;
    /**
     * Observe all dashboard pages and return observations.
     */
    observeAllPages(): Promise<Map<string, PageObservation>>;
    /**
     * Get the last observation for a page.
     */
    getLastObservation(path: string): PageObservation | undefined;
    /**
     * Extract specific elements by selector pattern from HTML.
     */
    extractElements(html: string, pattern: string): DOMElement[];
    private extractTitle;
    private parseDOM;
    private extractAttributes;
    private extractNavigation;
}
//# sourceMappingURL=browser-observer.d.ts.map
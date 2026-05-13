"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserObserver = void 0;
class BrowserObserver {
    config;
    observations = new Map();
    constructor(config) {
        this.config = config;
    }
    /**
     * Fetch and parse a dashboard page via HTTP.
     * Returns structured DOM observation without needing a real browser.
     */
    async observePage(path = '/') {
        const url = `${this.config.dashboardUrl}${path}`;
        const startTime = Date.now();
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'ShaarGuardian/1.0 (SeraphimOS Browser Observer)',
                    'Accept': 'text/html,application/xhtml+xml',
                },
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const html = await response.text();
            const loadTimeMs = Date.now() - startTime;
            const observation = {
                url,
                title: this.extractTitle(html),
                html,
                timestamp: new Date().toISOString(),
                elements: this.parseDOM(html),
                consoleErrors: [], // Can't capture JS errors without a real browser
                loadTimeMs,
            };
            this.observations.set(path, observation);
            return observation;
        }
        catch (error) {
            const loadTimeMs = Date.now() - startTime;
            return {
                url,
                title: 'Error',
                html: '',
                timestamp: new Date().toISOString(),
                elements: [],
                consoleErrors: [`Failed to fetch page: ${error.message}`],
                loadTimeMs,
            };
        }
    }
    /**
     * Get the navigation structure of the dashboard.
     */
    async getNavigation() {
        const observation = await this.observePage('/');
        return this.extractNavigation(observation.html);
    }
    /**
     * Get all pages available in the dashboard.
     */
    async getAvailablePages() {
        const nav = await this.getNavigation();
        const pages = ['/'];
        const extractPaths = (items) => {
            for (const item of items) {
                if (item.href)
                    pages.push(item.href);
                if (item.children.length > 0)
                    extractPaths(item.children);
            }
        };
        extractPaths(nav);
        return pages;
    }
    /**
     * Observe all dashboard pages and return observations.
     */
    async observeAllPages() {
        const pages = await this.getAvailablePages();
        for (const page of pages) {
            await this.observePage(page);
        }
        return this.observations;
    }
    /**
     * Get the last observation for a page.
     */
    getLastObservation(path) {
        return this.observations.get(path);
    }
    /**
     * Extract specific elements by selector pattern from HTML.
     */
    extractElements(html, pattern) {
        const elements = [];
        // Simple regex-based extraction for common patterns
        const tagMatch = pattern.match(/^(\w+)/);
        const classMatch = pattern.match(/\.([a-zA-Z0-9_-]+)/);
        const idMatch = pattern.match(/#([a-zA-Z0-9_-]+)/);
        const tag = tagMatch?.[1] || '';
        const className = classMatch?.[1] || '';
        const id = idMatch?.[1] || '';
        // Find matching elements in HTML
        const regex = new RegExp(`<${tag || '[a-z][a-z0-9]*'}[^>]*${className ? `class="[^"]*${className}[^"]*"` : ''}${id ? `id="${id}"` : ''}[^>]*>([^<]*)`, 'gi');
        let match;
        while ((match = regex.exec(html)) !== null) {
            elements.push({
                tag: tag || 'unknown',
                classes: className ? [className] : [],
                id: id || undefined,
                text: match[1]?.trim() || undefined,
                attributes: {},
                children: [],
            });
        }
        return elements;
    }
    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------
    extractTitle(html) {
        const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        return match?.[1]?.trim() || 'Untitled';
    }
    parseDOM(html) {
        const elements = [];
        // Extract key structural elements
        const patterns = [
            { regex: /<nav[^>]*>([\s\S]*?)<\/nav>/gi, tag: 'nav' },
            { regex: /<main[^>]*>([\s\S]*?)<\/main>/gi, tag: 'main' },
            { regex: /<header[^>]*>([\s\S]*?)<\/header>/gi, tag: 'header' },
            { regex: /<section[^>]*>([\s\S]*?)<\/section>/gi, tag: 'section' },
            { regex: /<button[^>]*>([\s\S]*?)<\/button>/gi, tag: 'button' },
            { regex: /<input[^>]*\/?>/gi, tag: 'input' },
            { regex: /<a[^>]*>([\s\S]*?)<\/a>/gi, tag: 'a' },
            { regex: /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, tag: 'heading' },
            { regex: /<form[^>]*>([\s\S]*?)<\/form>/gi, tag: 'form' },
            { regex: /<img[^>]*\/?>/gi, tag: 'img' },
            { regex: /<label[^>]*>([\s\S]*?)<\/label>/gi, tag: 'label' },
        ];
        for (const { regex, tag } of patterns) {
            let match;
            while ((match = regex.exec(html)) !== null) {
                const fullMatch = match[0];
                const attrs = this.extractAttributes(fullMatch);
                elements.push({
                    tag,
                    id: attrs['id'],
                    classes: (attrs['class'] || '').split(/\s+/).filter(Boolean),
                    text: match[1]?.replace(/<[^>]*>/g, '').trim().substring(0, 200) || undefined,
                    attributes: attrs,
                    children: [],
                    role: attrs['role'],
                    ariaLabel: attrs['aria-label'],
                });
            }
        }
        return elements;
    }
    extractAttributes(element) {
        const attrs = {};
        const attrRegex = /(\w[\w-]*)="([^"]*)"/g;
        let match;
        while ((match = attrRegex.exec(element)) !== null) {
            attrs[match[1]] = match[2];
        }
        return attrs;
    }
    extractNavigation(html) {
        const items = [];
        // Look for nav links
        const navRegex = /<a[^>]*class="[^"]*nav[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = navRegex.exec(html)) !== null) {
            const attrs = this.extractAttributes(match[0]);
            items.push({
                label: match[1]?.replace(/<[^>]*>/g, '').trim() || '',
                href: attrs['href'],
                isActive: (attrs['class'] || '').includes('active'),
                children: [],
            });
        }
        // Also look for button-based navigation (common in SPAs)
        const btnNavRegex = /<button[^>]*data-view="([^"]*)"[^>]*>([\s\S]*?)<\/button>/gi;
        while ((match = btnNavRegex.exec(html)) !== null) {
            items.push({
                label: match[2]?.replace(/<[^>]*>/g, '').trim() || '',
                href: match[1],
                isActive: match[0].includes('active'),
                children: [],
            });
        }
        return items;
    }
}
exports.BrowserObserver = BrowserObserver;
//# sourceMappingURL=browser-observer.js.map
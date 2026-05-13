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
  screenshotKey?: string; // S3 key if screenshot was captured
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

export class BrowserObserver {
  private config: BrowserObserverConfig;
  private observations: Map<string, PageObservation> = new Map();

  constructor(config: BrowserObserverConfig) {
    this.config = config;
  }

  /**
   * Fetch and parse a dashboard page via HTTP.
   * For SPAs: also fetches the main JS bundle to extract template HTML.
   * Returns structured DOM observation without needing a real browser.
   */
  async observePage(path: string = '/'): Promise<PageObservation> {
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

      let html = await response.text();

      // For SPAs: if the HTML is just a shell (<div id="root"></div>),
      // fetch the main JS bundle and extract template strings from it
      if (html.length < 2000 && html.includes('id="root"')) {
        const bundleHtml = await this.fetchBundleTemplates(html);
        if (bundleHtml) {
          html = html + '\n<!-- SPA Bundle Templates -->\n' + bundleHtml;
        }
      }

      const loadTimeMs = Date.now() - startTime;

      const observation: PageObservation = {
        url,
        title: this.extractTitle(html),
        html,
        timestamp: new Date().toISOString(),
        elements: this.parseDOM(html),
        consoleErrors: [],
        loadTimeMs,
      };

      this.observations.set(path, observation);
      return observation;
    } catch (error) {
      const loadTimeMs = Date.now() - startTime;
      return {
        url,
        title: 'Error',
        html: '',
        timestamp: new Date().toISOString(),
        elements: [],
        consoleErrors: [`Failed to fetch page: ${(error as Error).message}`],
        loadTimeMs,
      };
    }
  }

  /**
   * Get the navigation structure of the dashboard.
   */
  async getNavigation(): Promise<NavigationItem[]> {
    const observation = await this.observePage('/');
    return this.extractNavigation(observation.html);
  }

  /**
   * Get all pages available in the dashboard.
   */
  async getAvailablePages(): Promise<string[]> {
    const nav = await this.getNavigation();
    const pages: string[] = ['/'];
    const extractPaths = (items: NavigationItem[]) => {
      for (const item of items) {
        if (item.href) pages.push(item.href);
        if (item.children.length > 0) extractPaths(item.children);
      }
    };
    extractPaths(nav);
    return pages;
  }

  /**
   * Observe all dashboard pages and return observations.
   */
  async observeAllPages(): Promise<Map<string, PageObservation>> {
    const pages = await this.getAvailablePages();
    for (const page of pages) {
      await this.observePage(page);
    }
    return this.observations;
  }

  /**
   * Get the last observation for a page.
   */
  getLastObservation(path: string): PageObservation | undefined {
    return this.observations.get(path);
  }

  /**
   * Extract specific elements by selector pattern from HTML.
   */
  extractElements(html: string, pattern: string): DOMElement[] {
    const elements: DOMElement[] = [];
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

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match?.[1]?.trim() || 'Untitled';
  }

  private parseDOM(html: string): DOMElement[] {
    const elements: DOMElement[] = [];

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

  private extractAttributes(element: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrRegex = /(\w[\w-]*)="([^"]*)"/g;
    let match;
    while ((match = attrRegex.exec(element)) !== null) {
      attrs[match[1]] = match[2];
    }
    return attrs;
  }

  private extractNavigation(html: string): NavigationItem[] {
    const items: NavigationItem[] = [];
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

  /**
   * Fetch the main JS bundle from the SPA and extract HTML template strings.
   * This allows analyzing the SPA's rendered content without a browser.
   */
  private async fetchBundleTemplates(shellHtml: string): Promise<string | null> {
    try {
      // Find the main JS bundle URL from the HTML shell
      const scriptMatch = shellHtml.match(/src="([^"]*index[^"]*\.js)"/);
      if (!scriptMatch) return null;

      const bundleUrl = scriptMatch[1].startsWith('http')
        ? scriptMatch[1]
        : `${this.config.dashboardUrl}/${scriptMatch[1].replace(/^\//, '')}`;

      const response = await fetch(bundleUrl, {
        headers: { 'User-Agent': 'ShaarGuardian/1.0' },
      });

      if (!response.ok) return null;

      const js = await response.text();

      // Extract HTML template literals from the bundle
      // Look for template strings containing HTML tags
      const templates: string[] = [];
      const templateRegex = /`([^`]*<[a-z][^`]*)`/g;
      let match;
      while ((match = templateRegex.exec(js)) !== null) {
        const tmpl = match[1];
        // Only include substantial templates (not tiny fragments)
        if (tmpl.length > 50 && tmpl.includes('<div')) {
          templates.push(tmpl.substring(0, 2000)); // Cap each template
        }
        if (templates.length >= 50) break; // Cap total templates
      }

      // Also extract navigation items (data-view attributes)
      const navRegex = /data-view[=:]\s*["']([^"']+)["']/g;
      const navItems: string[] = [];
      while ((match = navRegex.exec(js)) !== null) {
        navItems.push(match[1]);
      }

      // Also extract metric labels and headings
      const labelRegex = /metric-label[^>]*>([^<]+)</g;
      const labels: string[] = [];
      while ((match = labelRegex.exec(js)) !== null) {
        labels.push(match[1]);
      }

      // Build a synthetic HTML representation
      const parts: string[] = [];
      if (navItems.length > 0) {
        parts.push(`<nav class="sidebar">${navItems.map(v => `<a class="nav-link" data-view="${v}" href="#">${v}</a>`).join('')}</nav>`);
      }
      if (labels.length > 0) {
        parts.push(`<main>${labels.map(l => `<div class="metric-card"><div class="metric-label">${l}</div></div>`).join('')}</main>`);
      }
      for (const tmpl of templates.slice(0, 20)) {
        parts.push(tmpl);
      }

      return parts.join('\n');
    } catch {
      return null;
    }
  }
}

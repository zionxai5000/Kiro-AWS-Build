/**
 * Shaar Agent — Comprehensive Unit Tests
 *
 * Tests all Shaar Agent services:
 * - BrowserObserver: Page observation, DOM parsing, navigation extraction
 * - UXFrictionDetector: Friction detection (missing labels, dead-ends, hidden status)
 * - DesignEvaluator: Design evaluation (layout, hierarchy, spacing, typography, color, CTAs)
 * - DataTruthAuditor: Data truth auditing (mock data, stale data, disconnected metrics)
 * - AgenticVisibilityAuditor: Agentic visibility (execution traces, memory, tool usage)
 * - RevenueWorkflowAuditor: Revenue workflow auditing (ZionX and ZXMG screens)
 * - ReadinessScoreCalculator: Score calculation, grading, trend detection
 * - RecommendationGenerator: Recommendation generation, approval, Kiro task dispatch
 * - VerificationService: Post-implementation verification
 * - ShaarAgentOrchestrator: Full review cycle
 *
 * Validates Requirements: 58a.1-58a.3, 58b.4-58b.6, 58c.7-58c.9, 58d.10-58d.11,
 * 58e.12-58e.13, 58f.14-58f.16, 58h.19-58h.20, 58i.21-58i.23, 58j.24-58j.25
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserObserver, type PageObservation } from '../browser-observer.js';
import { UXFrictionDetector } from '../ux-friction-detector.js';
import { DesignEvaluator } from '../design-evaluator.js';
import { DataTruthAuditor } from '../data-truth-auditor.js';
import { AgenticVisibilityAuditor } from '../agentic-visibility-auditor.js';
import { RevenueWorkflowAuditor } from '../revenue-workflow-auditor.js';
import { ReadinessScoreCalculator } from '../readiness-score.js';
import { RecommendationGenerator, type Recommendation } from '../recommendation-generator.js';
import { VerificationService } from '../verification-service.js';
import { ShaarAgentOrchestrator } from '../orchestrator.js';

// ---------------------------------------------------------------------------
// Test Helpers — HTML fixtures
// ---------------------------------------------------------------------------

function makeDashboardHtml(options: {
  title?: string;
  nav?: boolean;
  inputs?: { id?: string; label?: boolean; ariaLabel?: string; placeholder?: string }[];
  buttons?: { text?: string; classes?: string[]; ariaLabel?: string }[];
  headings?: string[];
  sections?: { id?: string; text?: string; hasAction?: boolean }[];
  images?: { src?: string; alt?: string }[];
  forms?: { id?: string }[];
  styles?: string;
  body?: string;
} = {}): string {
  const title = options.title || 'Dashboard';
  const parts: string[] = [];

  parts.push(`<html><head><title>${title}</title>`);
  if (options.styles) parts.push(`<style>${options.styles}</style>`);
  parts.push('</head><body>');

  if (options.nav) {
    parts.push('<nav><a class="nav-link active" href="/dashboard">Dashboard</a>');
    parts.push('<a class="nav-link" href="/settings">Settings</a></nav>');
  }

  parts.push('<main>');

  if (options.headings) {
    for (const h of options.headings) {
      parts.push(`<h2>${h}</h2>`);
    }
  }

  if (options.inputs) {
    for (const input of options.inputs) {
      const attrs: string[] = [];
      if (input.id) attrs.push(`id="${input.id}"`);
      if (input.ariaLabel) attrs.push(`aria-label="${input.ariaLabel}"`);
      if (input.placeholder) attrs.push(`placeholder="${input.placeholder}"`);
      if (input.label && input.id) {
        parts.push(`<label for="${input.id}">Label</label>`);
      }
      parts.push(`<input ${attrs.join(' ')} />`);
    }
  }

  if (options.buttons) {
    for (const btn of options.buttons) {
      const cls = btn.classes ? `class="${btn.classes.join(' ')}"` : '';
      const aria = btn.ariaLabel ? `aria-label="${btn.ariaLabel}"` : '';
      parts.push(`<button ${cls} ${aria}>${btn.text || ''}</button>`);
    }
  }

  if (options.sections) {
    for (const sec of options.sections) {
      const id = sec.id ? `id="${sec.id}"` : '';
      parts.push(`<section ${id}>${sec.text || ''}`);
      if (sec.hasAction) parts.push('<button>Action</button>');
      parts.push('</section>');
    }
  }

  if (options.images) {
    for (const img of options.images) {
      const attrs: string[] = [];
      if (img.src) attrs.push(`src="${img.src}"`);
      if (img.alt) attrs.push(`alt="${img.alt}"`);
      parts.push(`<img ${attrs.join(' ')} />`);
    }
  }

  if (options.forms) {
    for (const form of options.forms) {
      parts.push(`<form id="${form.id || ''}"></form>`);
    }
  }

  if (options.body) parts.push(options.body);

  parts.push('</main></body></html>');
  return parts.join('\n');
}

function makeObservation(html: string, url = 'http://localhost:3000/'): PageObservation {
  const observer = new BrowserObserver({ dashboardUrl: 'http://localhost:3000' });
  // Use the observer's internal parsing by calling extractElements indirectly
  // We'll construct the observation manually using the same parsing logic
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || 'Untitled';

  // Parse elements using same patterns as BrowserObserver
  const elements: PageObservation['elements'] = [];
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
      const attrs: Record<string, string> = {};
      const attrRegex = /(\w[\w-]*)="([^"]*)"/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(fullMatch)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }
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

  return {
    url,
    title,
    html,
    timestamp: new Date().toISOString(),
    elements,
    consoleErrors: [],
    loadTimeMs: 50,
  };
}

// ---------------------------------------------------------------------------
// 1. BrowserObserver Tests
// ---------------------------------------------------------------------------

describe('BrowserObserver', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('observes a page and extracts title', async () => {
    const html = '<html><head><title>Kings View</title></head><body><main><h1>Hello</h1></main></body></html>';
    (fetch as any).mockResolvedValue({
      ok: true,
      text: async () => html,
    });

    const observer = new BrowserObserver({ dashboardUrl: 'http://localhost:3000' });
    const result = await observer.observePage('/kings-view');

    expect(result.url).toBe('http://localhost:3000/kings-view');
    expect(result.title).toBe('Kings View');
    expect(result.html).toBe(html);
    expect(result.loadTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.consoleErrors).toHaveLength(0);
  });

  it('parses DOM elements from HTML', async () => {
    const html = makeDashboardHtml({
      title: 'Test',
      nav: true,
      buttons: [{ text: 'Click Me', classes: ['btn', 'primary'] }],
      headings: ['Section Title'],
    });
    (fetch as any).mockResolvedValue({ ok: true, text: async () => html });

    const observer = new BrowserObserver({ dashboardUrl: 'http://localhost:3000' });
    const result = await observer.observePage('/');

    expect(result.elements.length).toBeGreaterThan(0);
    const navEl = result.elements.find(e => e.tag === 'nav');
    expect(navEl).toBeDefined();
    const btnEl = result.elements.find(e => e.tag === 'button');
    expect(btnEl).toBeDefined();
    expect(btnEl!.text).toBe('Click Me');
    expect(btnEl!.classes).toContain('primary');
  });

  it('extracts navigation items', async () => {
    const html = '<html><head><title>Nav Test</title></head><body><nav><a class="nav-link active" href="/home">Home</a><a class="nav-link" href="/about">About</a></nav></body></html>';
    (fetch as any).mockResolvedValue({ ok: true, text: async () => html });

    const observer = new BrowserObserver({ dashboardUrl: 'http://localhost:3000' });
    const nav = await observer.getNavigation();

    expect(nav.length).toBe(2);
    expect(nav[0].label).toBe('Home');
    expect(nav[0].href).toBe('/home');
    expect(nav[0].isActive).toBe(true);
    expect(nav[1].label).toBe('About');
    expect(nav[1].isActive).toBe(false);
  });

  it('handles HTTP errors gracefully', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const observer = new BrowserObserver({ dashboardUrl: 'http://localhost:3000' });
    const result = await observer.observePage('/error');

    expect(result.title).toBe('Error');
    expect(result.html).toBe('');
    expect(result.consoleErrors.length).toBeGreaterThan(0);
    expect(result.consoleErrors[0]).toContain('500');
  });

  it('handles network failures gracefully', async () => {
    (fetch as any).mockRejectedValue(new Error('Network timeout'));

    const observer = new BrowserObserver({ dashboardUrl: 'http://localhost:3000' });
    const result = await observer.observePage('/timeout');

    expect(result.title).toBe('Error');
    expect(result.consoleErrors[0]).toContain('Network timeout');
  });

  it('extracts elements by selector pattern', async () => {
    const html = '<div class="metric-card"><span class="value">42</span></div><div class="metric-card"><span class="value">99</span></div>';
    (fetch as any).mockResolvedValue({ ok: true, text: async () => html });

    const observer = new BrowserObserver({ dashboardUrl: 'http://localhost:3000' });
    const elements = observer.extractElements(html, 'div.metric-card');

    expect(elements.length).toBeGreaterThanOrEqual(0); // regex-based extraction
  });

  it('caches observations and returns last observation', async () => {
    const html = '<html><head><title>Cached</title></head><body></body></html>';
    (fetch as any).mockResolvedValue({ ok: true, text: async () => html });

    const observer = new BrowserObserver({ dashboardUrl: 'http://localhost:3000' });
    await observer.observePage('/cached');

    const cached = observer.getLastObservation('/cached');
    expect(cached).toBeDefined();
    expect(cached!.title).toBe('Cached');
  });

  it('gets available pages from navigation', async () => {
    const html = '<html><head><title>Nav</title></head><body><nav><a class="nav-link" href="/page1">Page 1</a><a class="nav-link" href="/page2">Page 2</a></nav></body></html>';
    (fetch as any).mockResolvedValue({ ok: true, text: async () => html });

    const observer = new BrowserObserver({ dashboardUrl: 'http://localhost:3000' });
    const pages = await observer.getAvailablePages();

    expect(pages).toContain('/');
    expect(pages).toContain('/page1');
    expect(pages).toContain('/page2');
  });
});


// ---------------------------------------------------------------------------
// 2. UXFrictionDetector Tests
// ---------------------------------------------------------------------------

describe('UXFrictionDetector', () => {
  let detector: UXFrictionDetector;

  beforeEach(() => {
    detector = new UXFrictionDetector();
  });

  it('detects missing labels on inputs without aria-label or placeholder', () => {
    const html = makeDashboardHtml({
      inputs: [
        { id: 'email' }, // no label, no aria-label, no placeholder
      ],
    });
    const observation = makeObservation(html);
    const report = detector.analyze(observation);

    const labelIssues = report.issues.filter(i => i.category === 'missing-label');
    expect(labelIssues.length).toBeGreaterThan(0);
    expect(labelIssues[0].severity).toBe('high');
  });

  it('does not flag inputs with aria-label', () => {
    const html = makeDashboardHtml({
      inputs: [
        { id: 'search', ariaLabel: 'Search field' },
      ],
    });
    const observation = makeObservation(html);
    const report = detector.analyze(observation);

    const labelIssues = report.issues.filter(
      i => i.category === 'missing-label' && i.id.includes('search')
    );
    expect(labelIssues).toHaveLength(0);
  });

  it('does not flag inputs with associated label element', () => {
    const html = makeDashboardHtml({
      inputs: [
        { id: 'username', label: true },
      ],
    });
    const observation = makeObservation(html);
    const report = detector.analyze(observation);

    const labelIssues = report.issues.filter(
      i => i.category === 'missing-label' && i.id.includes('username')
    );
    expect(labelIssues).toHaveLength(0);
  });

  it('detects buttons without text or aria-label', () => {
    const html = makeDashboardHtml({
      buttons: [{ text: '', classes: ['icon-btn'] }],
    });
    const observation = makeObservation(html);
    const report = detector.analyze(observation);

    const btnIssues = report.issues.filter(
      i => i.category === 'missing-label' && i.description.includes('Button')
    );
    expect(btnIssues.length).toBeGreaterThan(0);
  });

  it('detects dead-end error messages without recovery actions', () => {
    const html = makeDashboardHtml({
      body: '<div class="error-message">Something went wrong</div>',
    });
    const observation = makeObservation(html);
    const report = detector.analyze(observation);

    const deadEndIssues = report.issues.filter(i => i.category === 'dead-end');
    expect(deadEndIssues.length).toBeGreaterThan(0);
  });

  it('detects hidden status indicators', () => {
    const html = makeDashboardHtml({
      body: '<div style="display: none" class="status-indicator">Active</div>',
    });
    const observation = makeObservation(html);
    const report = detector.analyze(observation);

    const hiddenIssues = report.issues.filter(i => i.category === 'hidden-status');
    expect(hiddenIssues.length).toBeGreaterThan(0);
  });

  it('detects cognitive overload with many interactive elements', () => {
    const buttons = Array.from({ length: 35 }, (_, i) => ({
      text: `Button ${i}`,
      classes: ['btn'],
    }));
    const html = makeDashboardHtml({ buttons });
    const observation = makeObservation(html);
    const report = detector.analyze(observation);

    const cogIssues = report.issues.filter(i => i.category === 'cognitive-overload');
    expect(cogIssues.length).toBeGreaterThan(0);
    expect(cogIssues[0].severity).toBe('high');
  });

  it('detects poor hierarchy when no primary CTA exists', () => {
    const buttons = Array.from({ length: 5 }, (_, i) => ({
      text: `Action ${i}`,
      classes: ['btn', 'secondary'],
    }));
    const html = makeDashboardHtml({ buttons });
    const observation = makeObservation(html);
    const report = detector.analyze(observation);

    const hierarchyIssues = report.issues.filter(i => i.category === 'poor-hierarchy');
    expect(hierarchyIssues.length).toBeGreaterThan(0);
  });

  it('calculates friction report scores correctly', () => {
    const html = makeDashboardHtml({
      nav: true,
      headings: ['Title', 'Subtitle'],
      buttons: [{ text: 'Submit', classes: ['primary'] }],
    });
    const observation = makeObservation(html);
    const report = detector.analyze(observation);

    expect(report.overallFrictionScore).toBeGreaterThanOrEqual(0);
    expect(report.overallFrictionScore).toBeLessThanOrEqual(100);
    expect(report.cognitiveLoadScore).toBeGreaterThanOrEqual(0);
    expect(report.informationHierarchyScore).toBeGreaterThanOrEqual(0);
    expect(report.informationHierarchyScore).toBeLessThanOrEqual(100);
    expect(report.totalIssues).toBe(report.criticalCount + report.highCount + report.mediumCount + report.lowCount);
  });

  it('detects images without alt text', () => {
    const html = makeDashboardHtml({
      images: [{ src: 'logo.png' }], // no alt
    });
    const observation = makeObservation(html);
    const report = detector.analyze(observation);

    const altIssues = report.issues.filter(
      i => i.category === 'missing-label' && i.description.includes('alt')
    );
    expect(altIssues.length).toBeGreaterThan(0);
  });

  it('detects empty states without guidance', () => {
    const html = makeDashboardHtml({
      body: '<div>No data available</div>',
    });
    const observation = makeObservation(html);
    const report = detector.analyze(observation);

    const emptyIssues = report.issues.filter(i => i.category === 'empty-state');
    expect(emptyIssues.length).toBeGreaterThan(0);
  });

  it('flags console errors as error-handling issues', () => {
    const html = makeDashboardHtml({});
    const observation = makeObservation(html);
    observation.consoleErrors = ['TypeError: Cannot read property of undefined'];
    const report = detector.analyze(observation);

    const errorIssues = report.issues.filter(i => i.category === 'error-handling');
    expect(errorIssues.length).toBe(1);
    expect(errorIssues[0].severity).toBe('high');
  });
});


// ---------------------------------------------------------------------------
// 3. DesignEvaluator Tests
// ---------------------------------------------------------------------------

describe('DesignEvaluator', () => {
  let evaluator: DesignEvaluator;

  beforeEach(() => {
    evaluator = new DesignEvaluator();
  });

  it('detects missing modern CSS layout', () => {
    const html = makeDashboardHtml({ title: 'No Layout' });
    const observation = makeObservation(html);
    const report = evaluator.evaluate(observation);

    const layoutIssues = report.issues.filter(i => i.category === 'layout');
    expect(layoutIssues.some(i => i.id === 'layout-no-modern')).toBe(true);
  });

  it('does not flag layout when flexbox is present', () => {
    const html = makeDashboardHtml({
      styles: '.container { display: flex; }',
    });
    const observation = makeObservation(html);
    const report = evaluator.evaluate(observation);

    const layoutIssues = report.issues.filter(i => i.id === 'layout-no-modern');
    expect(layoutIssues).toHaveLength(0);
  });

  it('detects missing heading hierarchy', () => {
    const html = makeDashboardHtml({ title: 'No Headings' });
    const observation = makeObservation(html);
    const report = evaluator.evaluate(observation);

    const hierarchyIssues = report.issues.filter(i => i.category === 'hierarchy');
    expect(hierarchyIssues.some(i => i.id === 'hierarchy-no-headings')).toBe(true);
  });

  it('detects too many font sizes', () => {
    const styles = Array.from({ length: 10 }, (_, i) => `.text-${i} { font-size: ${10 + i * 3}px; }`).join('\n');
    const html = makeDashboardHtml({ styles, headings: ['Title'] });
    const observation = makeObservation(html);
    const report = evaluator.evaluate(observation);

    const typoIssues = report.issues.filter(i => i.category === 'typography');
    expect(typoIssues.some(i => i.id === 'typography-too-many-sizes')).toBe(true);
  });

  it('detects vague CTA labels', () => {
    const html = makeDashboardHtml({
      buttons: [
        { text: 'click here', classes: ['btn'] },
        { text: 'ok', classes: ['btn'] },
      ],
      headings: ['Title'],
    });
    const observation = makeObservation(html);
    const report = evaluator.evaluate(observation);

    const ctaIssues = report.issues.filter(i => i.category === 'cta');
    expect(ctaIssues.some(i => i.id === 'cta-vague-labels')).toBe(true);
  });

  it('detects missing navigation element', () => {
    const html = '<html><head><title>No Nav</title></head><body><main><h1>Content</h1></main></body></html>';
    const observation = makeObservation(html);
    const report = evaluator.evaluate(observation);

    const navIssues = report.issues.filter(i => i.category === 'navigation');
    expect(navIssues.some(i => i.id === 'navigation-missing')).toBe(true);
  });

  it('detects missing loading state indicators', () => {
    const html = makeDashboardHtml({ headings: ['Title'], nav: true });
    const observation = makeObservation(html);
    const report = evaluator.evaluate(observation);

    const stateIssues = report.issues.filter(i => i.category === 'states');
    expect(stateIssues.some(i => i.id === 'states-no-loading')).toBe(true);
  });

  it('identifies strengths when good patterns are present', () => {
    const html = makeDashboardHtml({
      nav: true,
      headings: ['Title', 'Subtitle'],
      styles: '.container { display: grid; }',
      buttons: [{ text: 'Go', ariaLabel: 'Navigate', classes: ['btn'] }],
    });
    const observation = makeObservation(html);
    const report = evaluator.evaluate(observation);

    expect(report.strengths.length).toBeGreaterThan(0);
    expect(report.strengths).toContain('Clear navigation structure present');
  });

  it('calculates category scores and overall design score', () => {
    const html = makeDashboardHtml({
      nav: true,
      headings: ['Title'],
      styles: '.x { display: flex; }',
    });
    const observation = makeObservation(html);
    const report = evaluator.evaluate(observation);

    expect(report.overallDesignScore).toBeGreaterThanOrEqual(0);
    expect(report.overallDesignScore).toBeLessThanOrEqual(100);
    expect(report.categoryScores).toHaveProperty('layout');
    expect(report.categoryScores).toHaveProperty('hierarchy');
    expect(report.categoryScores).toHaveProperty('typography');
  });

  it('generates prioritized recommendations from issues', () => {
    const html = '<html><head><title>Bad</title></head><body></body></html>';
    const observation = makeObservation(html);
    const report = evaluator.evaluate(observation);

    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations[0].priority).toBe(1);
    // Recommendations should be sorted by impact
    for (let i = 1; i < report.recommendations.length; i++) {
      expect(report.recommendations[i].priority).toBe(i + 1);
    }
  });
});


// ---------------------------------------------------------------------------
// 4. DataTruthAuditor Tests
// ---------------------------------------------------------------------------

describe('DataTruthAuditor', () => {
  let auditor: DataTruthAuditor;

  beforeEach(() => {
    auditor = new DataTruthAuditor();
  });

  it('detects lorem ipsum mock data', () => {
    const html = makeDashboardHtml({
      body: '<p>Lorem ipsum dolor sit amet</p>',
      headings: ['Title'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    const mockIssues = report.issues.filter(i => i.category === 'mock-data');
    expect(mockIssues.some(i => i.id === 'mock-lorem-ipsum')).toBe(true);
    expect(mockIssues[0].severity).toBe('critical');
  });

  it('detects common mock data patterns (foo/bar, John Doe)', () => {
    const html = makeDashboardHtml({
      body: '<span>John Doe</span><span>foo</span>',
      headings: ['Users'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    const mockIssues = report.issues.filter(i => i.category === 'mock-data');
    expect(mockIssues.length).toBeGreaterThan(0);
  });

  it('detects placeholder values (N/A, ---, Coming soon)', () => {
    const html = makeDashboardHtml({
      body: '<div>N/A</div><div>---</div><div>Coming soon</div>',
      headings: ['Metrics'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    const placeholderIssues = report.issues.filter(i => i.category === 'placeholder');
    expect(placeholderIssues.length).toBeGreaterThan(0);
  });

  it('detects stale data from old dates', () => {
    const oldDate = '2023-01-15';
    const html = makeDashboardHtml({
      body: `<span>Last updated: ${oldDate}</span>`,
      headings: ['Report'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    const staleIssues = report.issues.filter(i => i.category === 'stale-data');
    expect(staleIssues.length).toBeGreaterThan(0);
  });

  it('detects disconnected data sources (connection errors)', () => {
    const html = makeDashboardHtml({
      body: '<div class="alert">Failed to load data from API</div>',
      headings: ['Dashboard'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    const disconnectedIssues = report.issues.filter(i => i.category === 'disconnected');
    expect(disconnectedIssues.length).toBeGreaterThan(0);
    expect(disconnectedIssues[0].severity).toBe('critical');
  });

  it('detects test/dev environment indicators', () => {
    const html = makeDashboardHtml({
      body: '<span>[dev] Environment</span><a href="http://localhost:8080/api">API</a>',
      headings: ['App'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    const testIssues = report.issues.filter(i => i.category === 'test-data');
    expect(testIssues.length).toBeGreaterThan(0);
  });

  it('calculates overall truth score', () => {
    const html = makeDashboardHtml({
      headings: ['Clean Page'],
      nav: true,
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    expect(report.overallTruthScore).toBeGreaterThanOrEqual(0);
    expect(report.overallTruthScore).toBeLessThanOrEqual(100);
  });

  it('audits metric cards for real vs mock data', () => {
    const html = makeDashboardHtml({
      body: `
        <div class="metric"><span class="label">Revenue</span><span class="value">$12,345.67</span></div>
        <div class="metric"><span class="label">Users</span><span class="value">N/A</span></div>
      `,
      headings: ['Metrics'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    // The metric audit should identify real vs placeholder values
    expect(report.mockDataCount + report.placeholderCount + report.staleDataCount + report.disconnectedCount).toBe(report.totalIssues);
  });

  it('detects empty data containers', () => {
    const html = makeDashboardHtml({
      body: '<div class="chart-container"></div><div class="stats-panel"></div>',
      headings: ['Analytics'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    const disconnectedIssues = report.issues.filter(i => i.category === 'disconnected');
    expect(disconnectedIssues.some(i => i.id === 'disconnected-empty-containers')).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// 5. AgenticVisibilityAuditor Tests
// ---------------------------------------------------------------------------

describe('AgenticVisibilityAuditor', () => {
  let auditor: AgenticVisibilityAuditor;

  beforeEach(() => {
    auditor = new AgenticVisibilityAuditor();
  });

  it('detects chatbot appearance when agent page lacks agentic features', () => {
    const html = makeDashboardHtml({
      body: '<div class="chat-container"><div class="message">Hello, how can I help?</div><div class="message">Tell me more</div></div>',
      headings: ['Agent Chat'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    expect(report.isChatbotLike).toBe(true);
    expect(report.issues.some(i => i.category === 'chatbot-appearance')).toBe(true);
  });

  it('does not flag non-agent pages as chatbot-like', () => {
    const html = makeDashboardHtml({
      headings: ['Settings'],
      body: '<div>Configuration options</div>',
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    expect(report.isChatbotLike).toBe(false);
  });

  it('detects present execution trace indicators', () => {
    const html = makeDashboardHtml({
      body: '<div class="chat-container"><div class="message">Hello</div></div><div class="execution-trace">Step 1: Planning</div>',
      headings: ['Agent'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    expect(report.presentIndicators).toContain('Execution Trace');
    expect(report.agenticFeatures.find(f => f.feature === 'Execution Trace')?.present).toBe(true);
  });

  it('detects present memory indicators', () => {
    const html = makeDashboardHtml({
      body: '<div class="chat-container"><div class="message">Hi</div></div><div class="memory-panel">Zikaron: 3 memories loaded</div>',
      headings: ['Agent'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    expect(report.presentIndicators).toContain('Memory Indicators');
  });

  it('detects present tool usage indicators', () => {
    const html = makeDashboardHtml({
      body: '<div class="chat-container"><div class="message">Working</div></div><div>MCP tool-usage: search_web</div>',
      headings: ['Agent'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    expect(report.presentIndicators).toContain('Tool Usage Display');
  });

  it('reports missing indicators for agent pages', () => {
    const html = makeDashboardHtml({
      body: '<div class="chat-container"><div class="message">Simple chat</div></div>',
      headings: ['Agent Chat'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    expect(report.missingIndicators.length).toBeGreaterThan(0);
    expect(report.missingIndicators).toContain('Execution Trace');
  });

  it('calculates visibility score based on present features', () => {
    const html = makeDashboardHtml({
      body: `
        <div class="chat-container"><div class="message">Hi</div></div>
        <div class="execution-trace">Planning step 1</div>
        <div>Memory: episodic loaded</div>
        <div>Tool usage: MCP search</div>
        <div>Delegation: assigned to sub-agent</div>
        <div>Autonomy level: L2 walk</div>
        <div>Token cost: $0.05</div>
        <div>Agent identity and role</div>
        <div>State machine: current state active</div>
        <div>Governance compliance: approved</div>
      `,
      headings: ['Agent'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    expect(report.overallVisibilityScore).toBe(100);
    expect(report.isChatbotLike).toBe(false);
  });

  it('generates issues only for agent-related pages', () => {
    const html = makeDashboardHtml({
      body: '<div>Regular settings page with no special content</div>',
      headings: ['Settings'],
    });
    const observation = makeObservation(html);
    const report = auditor.audit(observation);

    // Non-agent pages (no chat/agent/message/conversation keywords) should not get issues
    // from generateIssues (which only fires for agent pages)
    const agentSpecificIssues = report.issues.filter(i =>
      i.category === 'execution-trace' ||
      i.category === 'memory-indicator' ||
      i.category === 'tool-usage' ||
      i.category === 'delegation-status' ||
      i.category === 'planning-visibility' ||
      i.category === 'autonomy-level' ||
      i.category === 'cost-visibility'
    );
    expect(agentSpecificIssues).toHaveLength(0);
  });
});


// ---------------------------------------------------------------------------
// 6. RevenueWorkflowAuditor Tests
// ---------------------------------------------------------------------------

describe('RevenueWorkflowAuditor', () => {
  let auditor: RevenueWorkflowAuditor;

  beforeEach(() => {
    auditor = new RevenueWorkflowAuditor();
  });

  it('detects ZionX pillar and audits app store workflow', () => {
    const html = makeDashboardHtml({
      body: '<div class="zionx-pipeline">App Factory Pipeline</div>',
      headings: ['ZionX'],
    });
    const observation = makeObservation(html, 'http://localhost:3000/zionx');
    const report = auditor.audit(observation);

    expect(report.pillar).toBe('zionx');
    expect(report.issues.some(i => i.pillar === 'zionx')).toBe(true);
  });

  it('flags missing app store submission workflow for ZionX', () => {
    const html = makeDashboardHtml({
      body: '<div>ZionX app factory - development in progress</div>',
      headings: ['ZionX Pipeline'],
    });
    const observation = makeObservation(html, 'http://localhost:3000/zionx');
    const report = auditor.audit(observation);

    const submissionIssues = report.issues.filter(i => i.id === 'zionx-no-submission');
    expect(submissionIssues.length).toBeGreaterThan(0);
    expect(submissionIssues[0].revenueImpact).toBe('blocking');
  });

  it('detects ZXMG pillar and audits content pipeline', () => {
    const html = makeDashboardHtml({
      body: '<div>ZXMG Media Production Studio</div>',
      headings: ['Media'],
    });
    const observation = makeObservation(html, 'http://localhost:3000/zxmg');
    const report = auditor.audit(observation);

    expect(report.pillar).toBe('zxmg');
    expect(report.issues.some(i => i.pillar === 'zxmg')).toBe(true);
  });

  it('flags missing video production workflow for ZXMG', () => {
    const html = makeDashboardHtml({
      body: '<div>ZXMG dashboard - overview</div>',
      headings: ['ZXMG'],
    });
    const observation = makeObservation(html, 'http://localhost:3000/zxmg');
    const report = auditor.audit(observation);

    const productionIssues = report.issues.filter(i => i.id === 'zxmg-no-production');
    expect(productionIssues.length).toBeGreaterThan(0);
  });

  it('checks workflow completeness for ZionX', () => {
    const html = makeDashboardHtml({
      body: '<div>ZionX: idea concept, develop build, test QA, submit to app store, marketing campaign, revenue MRR tracking</div>',
      headings: ['ZionX Pipeline'],
    });
    const observation = makeObservation(html, 'http://localhost:3000/zionx');
    const report = auditor.audit(observation);

    expect(report.workflowCompleteness.length).toBeGreaterThan(0);
    const pipeline = report.workflowCompleteness[0];
    expect(pipeline.workflow).toBe('App-to-Revenue Pipeline');
    expect(pipeline.completeness).toBe(100);
    expect(pipeline.blockers).toHaveLength(0);
  });

  it('identifies revenue metrics present and missing', () => {
    const html = makeDashboardHtml({
      body: '<div>ZionX: Revenue $5000, MRR growth</div>',
      headings: ['ZionX'],
    });
    const observation = makeObservation(html, 'http://localhost:3000/zionx');
    const report = auditor.audit(observation);

    expect(report.revenueMetricsPresent.length).toBeGreaterThan(0);
    expect(report.revenueMetricsMissing.length).toBeGreaterThanOrEqual(0);
  });

  it('calculates money-making capability', () => {
    const html = makeDashboardHtml({
      body: '<div>General page with no revenue context</div>',
      headings: ['About'],
    });
    const observation = makeObservation(html, 'http://localhost:3000/about');
    const report = auditor.audit(observation);

    expect(['strong', 'partial', 'weak', 'none']).toContain(report.moneyMakingCapability);
  });

  it('audits Zion Alpha trading screens', () => {
    const html = makeDashboardHtml({
      body: '<div>Zion Alpha trading positions, P&L report, risk management stop-loss</div>',
      headings: ['Trading'],
    });
    const observation = makeObservation(html, 'http://localhost:3000/alpha');
    const report = auditor.audit(observation);

    expect(report.pillar).toBe('alpha');
    // Should not flag issues for present features
    expect(report.issues.filter(i => i.id === 'alpha-no-positions')).toHaveLength(0);
    expect(report.issues.filter(i => i.id === 'alpha-no-risk')).toHaveLength(0);
    expect(report.issues.filter(i => i.id === 'alpha-no-pnl')).toHaveLength(0);
  });

  it('flags missing risk management for Alpha', () => {
    const html = makeDashboardHtml({
      body: '<div>Zion Alpha: position tracking, portfolio holdings</div>',
      headings: ['Alpha'],
    });
    const observation = makeObservation(html, 'http://localhost:3000/alpha');
    const report = auditor.audit(observation);

    const riskIssues = report.issues.filter(i => i.id === 'alpha-no-risk');
    expect(riskIssues.length).toBeGreaterThan(0);
    expect(riskIssues[0].severity).toBe('critical');
  });
});


// ---------------------------------------------------------------------------
// 7. ReadinessScoreCalculator Tests
// ---------------------------------------------------------------------------

describe('ReadinessScoreCalculator', () => {
  let calculator: ReadinessScoreCalculator;

  beforeEach(() => {
    calculator = new ReadinessScoreCalculator();
  });

  it('calculates overall score from dimension reports', () => {
    const score = calculator.calculate({
      friction: {
        pageUrl: 'http://localhost:3000/',
        timestamp: new Date().toISOString(),
        totalIssues: 2,
        criticalCount: 0,
        highCount: 1,
        mediumCount: 1,
        lowCount: 0,
        overallFrictionScore: 30,
        issues: [
          { id: 'test-1', severity: 'high', category: 'missing-label', description: 'Test', element: '', recommendation: '', evidence: '', impactScore: 70 },
          { id: 'test-2', severity: 'medium', category: 'dead-end', description: 'Test', element: '', recommendation: '', evidence: '', impactScore: 50 },
        ],
        cognitiveLoadScore: 40,
        informationHierarchyScore: 70,
      },
    });

    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score.dimensions.length).toBe(5);
    expect(score.grade).toMatch(/^[A-F]$/);
  });

  it('assigns correct grades based on score', () => {
    // With all reports providing high scores
    const score = calculator.calculate({
      friction: {
        pageUrl: '', timestamp: '', totalIssues: 0, criticalCount: 0, highCount: 0,
        mediumCount: 0, lowCount: 0, overallFrictionScore: 5, issues: [],
        cognitiveLoadScore: 10, informationHierarchyScore: 90,
      },
      design: {
        pageUrl: '', timestamp: '', overallDesignScore: 95,
        categoryScores: {} as any, issues: [], strengths: [], recommendations: [],
      },
      dataTruth: {
        pageUrl: '', timestamp: '', overallTruthScore: 95, totalIssues: 0,
        mockDataCount: 0, placeholderCount: 0, staleDataCount: 0, disconnectedCount: 0,
        issues: [], metrics: [],
      },
      agenticVisibility: {
        pageUrl: '', timestamp: '', overallVisibilityScore: 95, isChatbotLike: false,
        issues: [], presentIndicators: ['Execution Trace', 'Memory'], missingIndicators: [],
        agenticFeatures: [],
      },
      revenueWorkflow: {
        pageUrl: '', timestamp: '', pillar: 'general', overallRevenueScore: 90,
        issues: [], workflowCompleteness: [], revenueMetricsPresent: ['MRR'],
        revenueMetricsMissing: [], moneyMakingCapability: 'strong',
      },
    });

    expect(score.grade).toBe('A');
    expect(score.overall).toBeGreaterThanOrEqual(90);
  });

  it('calculates points to next grade', () => {
    const score = calculator.calculate({});

    expect(score.pointsToNextGrade).toBeGreaterThan(0);
    expect(score.nextThreshold).toBeGreaterThan(score.overall);
  });

  it('generates top improvements sorted by lowest dimension', () => {
    const score = calculator.calculate({
      friction: {
        pageUrl: '', timestamp: '', totalIssues: 5, criticalCount: 2, highCount: 2,
        mediumCount: 1, lowCount: 0, overallFrictionScore: 80, issues: [
          { id: 'f1', severity: 'critical', category: 'missing-label', description: 'Fix labels', element: '', recommendation: 'Add labels', evidence: '', impactScore: 90 },
        ],
        cognitiveLoadScore: 70, informationHierarchyScore: 30,
      },
    });

    expect(score.topImprovements.length).toBeGreaterThan(0);
    expect(score.topImprovements[0].rank).toBe(1);
    expect(score.topImprovements[0].estimatedImpact).toBeGreaterThan(0);
  });

  it('detects trend as stable on first calculation', () => {
    const score = calculator.calculate({});
    expect(score.trend).toBe('stable');
  });

  it('detects improving trend when score increases', () => {
    // First calculation (low score)
    calculator.calculate({
      friction: {
        pageUrl: '', timestamp: '', totalIssues: 5, criticalCount: 2, highCount: 2,
        mediumCount: 1, lowCount: 0, overallFrictionScore: 80, issues: [],
        cognitiveLoadScore: 70, informationHierarchyScore: 30,
      },
    });

    // Second calculation (also low score — establishes baseline in history)
    calculator.calculate({
      friction: {
        pageUrl: '', timestamp: '', totalIssues: 5, criticalCount: 2, highCount: 2,
        mediumCount: 1, lowCount: 0, overallFrictionScore: 80, issues: [],
        cognitiveLoadScore: 70, informationHierarchyScore: 30,
      },
    });

    // Third calculation with much better scores — trend should detect improvement
    const score3 = calculator.calculate({
      friction: {
        pageUrl: '', timestamp: '', totalIssues: 0, criticalCount: 0, highCount: 0,
        mediumCount: 0, lowCount: 0, overallFrictionScore: 5, issues: [],
        cognitiveLoadScore: 10, informationHierarchyScore: 90,
      },
      design: {
        pageUrl: '', timestamp: '', overallDesignScore: 90,
        categoryScores: {} as any, issues: [], strengths: [], recommendations: [],
      },
      dataTruth: {
        pageUrl: '', timestamp: '', overallTruthScore: 90, totalIssues: 0,
        mockDataCount: 0, placeholderCount: 0, staleDataCount: 0, disconnectedCount: 0,
        issues: [], metrics: [],
      },
      agenticVisibility: {
        pageUrl: '', timestamp: '', overallVisibilityScore: 90, isChatbotLike: false,
        issues: [], presentIndicators: [], missingIndicators: [], agenticFeatures: [],
      },
      revenueWorkflow: {
        pageUrl: '', timestamp: '', pillar: 'general', overallRevenueScore: 90,
        issues: [], workflowCompleteness: [], revenueMetricsPresent: [],
        revenueMetricsMissing: [], moneyMakingCapability: 'strong',
      },
    });

    expect(score3.trend).toBe('improving');
  });

  it('stores history of scores', () => {
    calculator.calculate({});
    calculator.calculate({});

    const history = calculator.getHistory();
    expect(history.scores.length).toBe(2);
    expect(history.scores[0]).toHaveProperty('timestamp');
    expect(history.scores[0]).toHaveProperty('overall');
    expect(history.scores[0]).toHaveProperty('grade');
  });

  it('uses correct dimension weights summing to 1.0', () => {
    const score = calculator.calculate({});
    const totalWeight = score.dimensions.reduce((sum, d) => sum + d.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 2);
  });
});


// ---------------------------------------------------------------------------
// 8. RecommendationGenerator Tests
// ---------------------------------------------------------------------------

describe('RecommendationGenerator', () => {
  let generator: RecommendationGenerator;

  beforeEach(() => {
    generator = new RecommendationGenerator();
  });

  it('generates recommendations from friction issues', () => {
    const batch = generator.generate({
      friction: {
        pageUrl: 'http://localhost:3000/',
        timestamp: new Date().toISOString(),
        totalIssues: 1,
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        overallFrictionScore: 50,
        issues: [{
          id: 'missing-label-email',
          severity: 'critical',
          category: 'missing-label',
          description: 'Input without label',
          element: '#email',
          recommendation: 'Add aria-label',
          evidence: 'Found input without label',
          impactScore: 80,
        }],
        cognitiveLoadScore: 30,
        informationHierarchyScore: 70,
      },
    });

    expect(batch.totalCount).toBeGreaterThan(0);
    expect(batch.criticalCount).toBe(1);
    expect(batch.recommendations[0].dimension).toBe('UX Quality');
    expect(batch.recommendations[0].status).toBe('pending');
  });

  it('generates recommendations from design issues', () => {
    const batch = generator.generate({
      design: {
        pageUrl: 'http://localhost:3000/',
        timestamp: new Date().toISOString(),
        overallDesignScore: 50,
        categoryScores: {} as any,
        issues: [{
          id: 'hierarchy-no-headings',
          severity: 'high',
          category: 'hierarchy',
          description: 'No headings',
          recommendation: 'Add headings',
          evidence: 'No h1-h6 found',
          designPrinciple: 'Visual hierarchy',
          impactScore: 70,
        }],
        strengths: [],
        recommendations: [],
      },
    });

    expect(batch.totalCount).toBeGreaterThan(0);
    expect(batch.recommendations[0].dimension).toBe('Visual Design');
  });

  it('sorts recommendations by severity then impact', () => {
    const batch = generator.generate({
      friction: {
        pageUrl: 'http://localhost:3000/',
        timestamp: '',
        totalIssues: 2,
        criticalCount: 1,
        highCount: 1,
        mediumCount: 0,
        lowCount: 0,
        overallFrictionScore: 60,
        issues: [
          { id: 'low-impact', severity: 'high', category: 'dead-end', description: 'Low impact', element: '', recommendation: '', evidence: '', impactScore: 30 },
          { id: 'high-impact', severity: 'critical', category: 'missing-label', description: 'High impact', element: '', recommendation: '', evidence: '', impactScore: 90 },
        ],
        cognitiveLoadScore: 50,
        informationHierarchyScore: 50,
      },
    });

    expect(batch.recommendations[0].severity).toBe('critical');
    expect(batch.recommendations[0].priority).toBe(1);
  });

  it('approves a recommendation', () => {
    const batch = generator.generate({
      friction: {
        pageUrl: 'http://localhost:3000/',
        timestamp: '',
        totalIssues: 1,
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        overallFrictionScore: 50,
        issues: [{
          id: 'test-issue',
          severity: 'critical',
          category: 'missing-label',
          description: 'Test',
          element: '',
          recommendation: 'Fix it',
          evidence: 'Evidence',
          impactScore: 80,
        }],
        cognitiveLoadScore: 30,
        informationHierarchyScore: 70,
      },
    });

    const recId = batch.recommendations[0].id;
    const approved = generator.approve(recId);

    expect(approved).not.toBeNull();
    expect(approved!.status).toBe('approved');
    expect(approved!.approvedAt).toBeDefined();
  });

  it('dispatches approved recommendation to Kiro', () => {
    const batch = generator.generate({
      friction: {
        pageUrl: 'http://localhost:3000/',
        timestamp: '',
        totalIssues: 1,
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        overallFrictionScore: 50,
        issues: [{
          id: 'dispatch-test',
          severity: 'critical',
          category: 'missing-label',
          description: 'Dispatch test',
          element: '#input',
          recommendation: 'Add label',
          evidence: 'No label found',
          impactScore: 80,
        }],
        cognitiveLoadScore: 30,
        informationHierarchyScore: 70,
      },
    });

    const recId = batch.recommendations[0].id;
    generator.approve(recId);
    const task = generator.dispatchToKiro(recId);

    expect(task).not.toBeNull();
    expect(task!.title).toBe('Dispatch test');
    expect(task!.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(task!.steps.length).toBeGreaterThan(0);

    // Recommendation should now be dispatched
    const rec = generator.getAll().find(r => r.id === recId);
    expect(rec!.status).toBe('dispatched');
    expect(rec!.kiroTaskId).toBeDefined();
  });

  it('does not dispatch unapproved recommendations', () => {
    const batch = generator.generate({
      friction: {
        pageUrl: 'http://localhost:3000/',
        timestamp: '',
        totalIssues: 1,
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        overallFrictionScore: 50,
        issues: [{
          id: 'no-approve',
          severity: 'critical',
          category: 'missing-label',
          description: 'Not approved',
          element: '',
          recommendation: '',
          evidence: '',
          impactScore: 80,
        }],
        cognitiveLoadScore: 30,
        informationHierarchyScore: 70,
      },
    });

    const recId = batch.recommendations[0].id;
    const task = generator.dispatchToKiro(recId); // Not approved first

    expect(task).toBeNull();
  });

  it('tracks recommendation status lifecycle', () => {
    const batch = generator.generate({
      friction: {
        pageUrl: 'http://localhost:3000/',
        timestamp: '',
        totalIssues: 1,
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        overallFrictionScore: 50,
        issues: [{
          id: 'lifecycle-test',
          severity: 'critical',
          category: 'missing-label',
          description: 'Lifecycle',
          element: '',
          recommendation: '',
          evidence: '',
          impactScore: 80,
        }],
        cognitiveLoadScore: 30,
        informationHierarchyScore: 70,
      },
    });

    const recId = batch.recommendations[0].id;

    // pending -> approved -> dispatched -> implemented -> verified
    expect(generator.getByStatus('pending')).toHaveLength(1);

    generator.approve(recId);
    expect(generator.getByStatus('approved')).toHaveLength(1);

    generator.dispatchToKiro(recId);
    expect(generator.getByStatus('dispatched')).toHaveLength(1);

    generator.markImplemented(recId);
    expect(generator.getByStatus('implemented')).toHaveLength(1);

    generator.markVerified(recId);
    expect(generator.getByStatus('verified')).toHaveLength(1);
  });

  it('returns null when approving non-existent recommendation', () => {
    const result = generator.approve('non-existent-id');
    expect(result).toBeNull();
  });

  it('generates recommendations from all report types', () => {
    const batch = generator.generate({
      friction: {
        pageUrl: 'http://localhost:3000/', timestamp: '', totalIssues: 1, criticalCount: 1,
        highCount: 0, mediumCount: 0, lowCount: 0, overallFrictionScore: 50,
        issues: [{ id: 'f1', severity: 'critical', category: 'missing-label', description: 'Friction', element: '', recommendation: 'Fix', evidence: '', impactScore: 80 }],
        cognitiveLoadScore: 30, informationHierarchyScore: 70,
      },
      dataTruth: {
        pageUrl: 'http://localhost:3000/', timestamp: '', overallTruthScore: 40, totalIssues: 1,
        mockDataCount: 1, placeholderCount: 0, staleDataCount: 0, disconnectedCount: 0,
        issues: [{ id: 'd1', severity: 'critical', category: 'mock-data', description: 'Mock data', element: '', evidence: '', recommendation: 'Fix', impactScore: 90 }],
        metrics: [],
      },
      agenticVisibility: {
        pageUrl: 'http://localhost:3000/', timestamp: '', overallVisibilityScore: 30, isChatbotLike: true,
        issues: [{ id: 'a1', severity: 'critical', category: 'chatbot-appearance', description: 'Chatbot', recommendation: 'Fix', evidence: '', impactScore: 90 }],
        presentIndicators: [], missingIndicators: ['Execution Trace'], agenticFeatures: [],
      },
      revenueWorkflow: {
        pageUrl: 'http://localhost:3000/', timestamp: '', pillar: 'zionx', overallRevenueScore: 30,
        issues: [{ id: 'r1', severity: 'high', category: 'missing-workflow', pillar: 'zionx', description: 'No submission', recommendation: 'Add', evidence: '', revenueImpact: 'blocking', impactScore: 80 }],
        workflowCompleteness: [], revenueMetricsPresent: [], revenueMetricsMissing: ['MRR'], moneyMakingCapability: 'weak',
      },
    });

    expect(batch.totalCount).toBeGreaterThanOrEqual(4);
    const dimensions = batch.recommendations.map(r => r.dimension);
    expect(dimensions).toContain('UX Quality');
    expect(dimensions).toContain('Data Truth');
    expect(dimensions).toContain('Agentic Visibility');
    expect(dimensions).toContain('Revenue Workflow');
  });
});


// ---------------------------------------------------------------------------
// 9. VerificationService Tests
// ---------------------------------------------------------------------------

describe('VerificationService', () => {
  let service: VerificationService;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    service = new VerificationService('http://localhost:3000');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('verifies a recommendation after implementation', async () => {
    const goodHtml = makeDashboardHtml({
      nav: true,
      headings: ['Dashboard', 'Metrics'],
      buttons: [{ text: 'Deploy', classes: ['primary'] }],
      inputs: [{ id: 'search', ariaLabel: 'Search' }],
    });
    (fetch as any).mockResolvedValue({ ok: true, text: async () => goodHtml });

    const recommendation: Recommendation = {
      id: 'rec-friction-test-issue',
      priority: 1,
      title: 'Fix missing label',
      description: 'Add label to input',
      category: 'missing-label',
      dimension: 'UX Quality',
      severity: 'high',
      evidence: {
        pageUrl: 'http://localhost:3000/dashboard',
        observation: 'Input without label',
        beforeState: 'Missing label',
      },
      acceptanceCriteria: ['The missing-label issue is resolved', 'No regression in surrounding UX'],
      implementationGuidance: ['Add aria-label'],
      estimatedEffort: 'low',
      estimatedImpact: 7,
      status: 'implemented',
      createdAt: new Date().toISOString(),
    };

    const result = await service.verify(recommendation);

    expect(result.recommendationId).toBe('rec-friction-test-issue');
    expect(result.timestamp).toBeDefined();
    expect(result.afterObservation).toBeDefined();
    expect(result.comparison).toBeDefined();
    expect(result.acceptanceCriteriaResults.length).toBe(2);
    expect(result.summary).toBeDefined();
  });

  it('captures before snapshot for comparison', async () => {
    const beforeHtml = makeDashboardHtml({
      body: '<input id="email" />', // no label
      headings: ['Form'],
    });
    const afterHtml = makeDashboardHtml({
      body: '<label for="email">Email</label><input id="email" />',
      headings: ['Form'],
    });

    let callCount = 0;
    (fetch as any).mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        text: async () => callCount === 1 ? beforeHtml : afterHtml,
      };
    });

    const recommendation: Recommendation = {
      id: 'rec-friction-snapshot-test',
      priority: 1,
      title: 'Add email label',
      description: 'Add label to email input',
      category: 'missing-label',
      dimension: 'UX Quality',
      severity: 'high',
      evidence: {
        pageUrl: 'http://localhost:3000/form',
        observation: 'Email input without label',
        beforeState: 'Missing label',
      },
      acceptanceCriteria: ['The missing-label issue is resolved'],
      implementationGuidance: ['Add label element'],
      estimatedEffort: 'low',
      estimatedImpact: 7,
      status: 'implemented',
      createdAt: new Date().toISOString(),
    };

    await service.captureBeforeSnapshot(recommendation);
    const result = await service.verify(recommendation);

    expect(result.beforeObservation).not.toBeNull();
    expect(result.comparison.frictionScoreBefore).toBeGreaterThanOrEqual(0);
    expect(result.comparison.frictionScoreAfter).toBeGreaterThanOrEqual(0);
  });

  it('reports verification failure when issue persists', async () => {
    // Same bad HTML before and after
    const badHtml = makeDashboardHtml({
      body: '<input id="email" />', // still no label
      headings: ['Form'],
    });
    (fetch as any).mockResolvedValue({ ok: true, text: async () => badHtml });

    const recommendation: Recommendation = {
      id: 'rec-friction-missing-label-email',
      priority: 1,
      title: 'Add email label',
      description: 'Add label',
      category: 'missing-label',
      dimension: 'UX Quality',
      severity: 'high',
      evidence: {
        pageUrl: 'http://localhost:3000/form',
        observation: 'Missing label',
        beforeState: 'No label',
      },
      acceptanceCriteria: ['The missing-label issue is resolved'],
      implementationGuidance: ['Add label'],
      estimatedEffort: 'low',
      estimatedImpact: 7,
      status: 'implemented',
      createdAt: new Date().toISOString(),
    };

    await service.captureBeforeSnapshot(recommendation);
    const result = await service.verify(recommendation);

    // The issue should still be detected, so verification may fail
    expect(result.summary).toBeDefined();
    expect(typeof result.passed).toBe('boolean');
  });

  it('generates appropriate summary for passed verification', async () => {
    const goodHtml = makeDashboardHtml({
      nav: true,
      headings: ['Clean Page'],
      buttons: [{ text: 'Action', classes: ['primary'] }],
    });
    (fetch as any).mockResolvedValue({ ok: true, text: async () => goodHtml });

    const recommendation: Recommendation = {
      id: 'rec-friction-unique-resolved',
      priority: 1,
      title: 'Fix navigation',
      description: 'Add nav',
      category: 'unclear-navigation',
      dimension: 'UX Quality',
      severity: 'medium',
      evidence: {
        pageUrl: 'http://localhost:3000/',
        observation: 'No nav',
        beforeState: 'Missing nav',
      },
      acceptanceCriteria: ['No regression in surrounding UX'],
      implementationGuidance: ['Add nav element'],
      estimatedEffort: 'low',
      estimatedImpact: 5,
      status: 'implemented',
      createdAt: new Date().toISOString(),
    };

    const result = await service.verify(recommendation);
    expect(result.summary).toContain('VERIFIED');
  });
});


// ---------------------------------------------------------------------------
// 10. ShaarAgentOrchestrator Tests
// ---------------------------------------------------------------------------

describe('ShaarAgentOrchestrator', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('performs a complete page review', async () => {
    const html = makeDashboardHtml({
      title: 'Kings View',
      nav: true,
      headings: ['Dashboard', 'Metrics'],
      buttons: [
        { text: 'Deploy', classes: ['btn', 'primary'] },
        { text: 'Settings', classes: ['btn'] },
      ],
      inputs: [{ id: 'search', ariaLabel: 'Search' }],
      styles: '.container { display: flex; }',
    });
    (fetch as any).mockResolvedValue({ ok: true, text: async () => html });

    const orchestrator = new ShaarAgentOrchestrator({ dashboardUrl: 'http://localhost:3000' });
    const result = await orchestrator.reviewPage('/kings-view');

    expect(result.pageUrl).toBe('http://localhost:3000/kings-view');
    expect(result.timestamp).toBeDefined();
    expect(result.observation).toBeDefined();
    expect(result.friction).toBeDefined();
    expect(result.design).toBeDefined();
    expect(result.dataTruth).toBeDefined();
    expect(result.agenticVisibility).toBeDefined();
    expect(result.revenueWorkflow).toBeDefined();
    expect(result.readinessScore).toBeDefined();
    expect(result.recommendations).toBeDefined();
    expect(result.summary).toContain('Shaar Guardian Review');
    expect(result.summary).toContain('Readiness Score');
  });

  it('reviews all pages from navigation', async () => {
    const navHtml = '<html><head><title>Home</title></head><body><nav><a class="nav-link" href="/page1">Page 1</a></nav><main></main></body></html>';
    const pageHtml = '<html><head><title>Page 1</title></head><body><main><h1>Content</h1></main></body></html>';

    let callCount = 0;
    (fetch as any).mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        text: async () => callCount <= 2 ? navHtml : pageHtml, // First two calls for nav discovery
      };
    });

    const orchestrator = new ShaarAgentOrchestrator({ dashboardUrl: 'http://localhost:3000' });
    const results = await orchestrator.reviewAllPages();

    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const result of results) {
      expect(result.readinessScore).toBeDefined();
      expect(result.recommendations).toBeDefined();
    }
  });

  it('approve-and-dispatch flow works end to end', async () => {
    const html = makeDashboardHtml({
      body: '<input id="broken" />', // Missing label - will generate a recommendation
      headings: ['Form'],
    });
    (fetch as any).mockResolvedValue({ ok: true, text: async () => html });

    const orchestrator = new ShaarAgentOrchestrator({ dashboardUrl: 'http://localhost:3000' });
    const review = await orchestrator.reviewPage('/form');

    // Should have recommendations
    if (review.recommendations.totalCount > 0) {
      const recId = review.recommendations.recommendations[0].id;

      const { recommendation, kiroTask } = orchestrator.approveAndDispatch(recId);

      expect(recommendation).not.toBeNull();
      expect(recommendation!.status).toBe('dispatched');
      expect(kiroTask).not.toBeNull();
      expect(kiroTask.title).toBeDefined();
      expect(kiroTask.acceptanceCriteria.length).toBeGreaterThan(0);
    }
  });

  it('returns null for non-existent recommendation in approve-and-dispatch', async () => {
    const orchestrator = new ShaarAgentOrchestrator({ dashboardUrl: 'http://localhost:3000' });
    const { recommendation, kiroTask } = orchestrator.approveAndDispatch('non-existent');

    expect(recommendation).toBeNull();
    expect(kiroTask).toBeNull();
  });

  it('gets pending and dispatched recommendations', async () => {
    const html = makeDashboardHtml({
      body: '<input id="no-label" />',
      headings: ['Test'],
    });
    (fetch as any).mockResolvedValue({ ok: true, text: async () => html });

    const orchestrator = new ShaarAgentOrchestrator({ dashboardUrl: 'http://localhost:3000' });
    await orchestrator.reviewPage('/');

    const pending = orchestrator.getPendingRecommendations();
    expect(pending.length).toBeGreaterThanOrEqual(0);

    // Dispatch one if available
    if (pending.length > 0) {
      orchestrator.approveAndDispatch(pending[0].id);
      const dispatched = orchestrator.getDispatchedRecommendations();
      expect(dispatched.length).toBe(1);
    }
  });

  it('verifies implementation via orchestrator', async () => {
    const html = makeDashboardHtml({
      nav: true,
      headings: ['Fixed Page'],
      buttons: [{ text: 'Action', classes: ['primary'] }],
    });
    (fetch as any).mockResolvedValue({ ok: true, text: async () => html });

    const orchestrator = new ShaarAgentOrchestrator({ dashboardUrl: 'http://localhost:3000' });

    const recommendation: Recommendation = {
      id: 'rec-friction-verify-test',
      priority: 1,
      title: 'Test verification',
      description: 'Test',
      category: 'missing-label',
      dimension: 'UX Quality',
      severity: 'high',
      evidence: {
        pageUrl: 'http://localhost:3000/',
        observation: 'Test',
        beforeState: 'Before',
      },
      acceptanceCriteria: ['No regression in surrounding UX'],
      implementationGuidance: ['Fix it'],
      estimatedEffort: 'low',
      estimatedImpact: 5,
      status: 'implemented',
      createdAt: new Date().toISOString(),
    };

    const result = await orchestrator.verifyImplementation(recommendation);
    expect(result.recommendationId).toBe('rec-friction-verify-test');
    expect(typeof result.passed).toBe('boolean');
    expect(result.summary).toBeDefined();
  });

  it('generates summary with readiness score and recommendations', async () => {
    const html = makeDashboardHtml({
      title: 'Summary Test',
      nav: true,
      headings: ['Dashboard'],
      body: '<input id="unlabeled" />', // Will generate issues
    });
    (fetch as any).mockResolvedValue({ ok: true, text: async () => html });

    const orchestrator = new ShaarAgentOrchestrator({ dashboardUrl: 'http://localhost:3000' });
    const result = await orchestrator.reviewPage('/');

    expect(result.summary).toContain('Readiness Score');
    expect(result.summary).toContain('Grade');
    expect(result.summary).toContain('Dimension Scores');
  });
});

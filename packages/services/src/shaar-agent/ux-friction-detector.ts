/**
 * Shaar Agent — UX Friction Detector
 *
 * Analyzes dashboard DOM for UX friction patterns:
 * - Missing labels on interactive elements
 * - Dead-end workflows (no clear next action)
 * - Hidden status indicators
 * - Missing loading/error feedback
 * - Unclear navigation
 * - High cognitive load
 * - Poor information hierarchy
 */

import type { PageObservation, DOMElement } from './browser-observer.js';

export interface FrictionIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: FrictionCategory;
  description: string;
  element?: string; // CSS selector or description of the element
  recommendation: string;
  evidence: string; // What was observed
  impactScore: number; // 0-100
}

export type FrictionCategory =
  | 'missing-label'
  | 'dead-end'
  | 'hidden-status'
  | 'missing-feedback'
  | 'unclear-navigation'
  | 'cognitive-overload'
  | 'poor-hierarchy'
  | 'accessibility'
  | 'empty-state'
  | 'error-handling';

export interface FrictionReport {
  pageUrl: string;
  timestamp: string;
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  overallFrictionScore: number; // 0-100 (lower is better)
  issues: FrictionIssue[];
  cognitiveLoadScore: number; // 0-100 (lower is better)
  informationHierarchyScore: number; // 0-100 (higher is better)
}

export class UXFrictionDetector {
  /**
   * Analyze a page observation for UX friction.
   */
  analyze(observation: PageObservation): FrictionReport {
    const issues: FrictionIssue[] = [];

    // Run all friction detectors
    issues.push(...this.detectMissingLabels(observation));
    issues.push(...this.detectDeadEnds(observation));
    issues.push(...this.detectHiddenStatus(observation));
    issues.push(...this.detectMissingFeedback(observation));
    issues.push(...this.detectUnclearNavigation(observation));
    issues.push(...this.detectCognitiveOverload(observation));
    issues.push(...this.detectPoorHierarchy(observation));
    issues.push(...this.detectAccessibilityIssues(observation));
    issues.push(...this.detectEmptyStates(observation));
    issues.push(...this.detectErrorHandling(observation));

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;
    const mediumCount = issues.filter(i => i.severity === 'medium').length;
    const lowCount = issues.filter(i => i.severity === 'low').length;

    // Calculate overall friction score (weighted by severity)
    const totalWeight = criticalCount * 4 + highCount * 3 + mediumCount * 2 + lowCount * 1;
    const maxPossibleWeight = issues.length * 4;
    const overallFrictionScore = maxPossibleWeight > 0
      ? Math.min(100, Math.round((totalWeight / Math.max(maxPossibleWeight, 1)) * 100))
      : 0;

    return {
      pageUrl: observation.url,
      timestamp: observation.timestamp,
      totalIssues: issues.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      overallFrictionScore,
      issues,
      cognitiveLoadScore: this.calculateCognitiveLoad(observation),
      informationHierarchyScore: this.calculateHierarchyScore(observation),
    };
  }

  // -------------------------------------------------------------------------
  // Friction Detectors
  // -------------------------------------------------------------------------

  private detectMissingLabels(observation: PageObservation): FrictionIssue[] {
    const issues: FrictionIssue[] = [];
    const { elements, html } = observation;

    // Check for inputs without labels
    const inputs = elements.filter(e => e.tag === 'input');
    for (const input of inputs) {
      if (!input.ariaLabel && !input.attributes['placeholder'] && !input.attributes['title']) {
        // Check if there's an associated label
        const inputId = input.id;
        if (!inputId || !html.includes(`for="${inputId}"`)) {
          issues.push({
            id: `missing-label-${input.id || 'unknown'}`,
            severity: 'high',
            category: 'missing-label',
            description: `Input element without accessible label`,
            element: input.id ? `#${input.id}` : `input[type="${input.attributes['type'] || 'text'}"]`,
            recommendation: 'Add aria-label, associated <label>, or descriptive placeholder',
            evidence: `Found <input> without label, aria-label, or placeholder`,
            impactScore: 70,
          });
        }
      }
    }

    // Check for buttons without text or aria-label
    const buttons = elements.filter(e => e.tag === 'button');
    for (const btn of buttons) {
      if (!btn.text && !btn.ariaLabel) {
        issues.push({
          id: `missing-label-btn-${btn.id || 'unknown'}`,
          severity: 'medium',
          category: 'missing-label',
          description: 'Button without visible text or aria-label',
          element: btn.id ? `#${btn.id}` : 'button',
          recommendation: 'Add visible text content or aria-label to the button',
          evidence: `Found <button> with no text content and no aria-label`,
          impactScore: 60,
        });
      }
    }

    // Check for images without alt text
    const images = elements.filter(e => e.tag === 'img');
    for (const img of images) {
      if (!img.attributes['alt']) {
        issues.push({
          id: `missing-alt-${img.attributes['src']?.substring(0, 20) || 'unknown'}`,
          severity: 'medium',
          category: 'missing-label',
          description: 'Image without alt text',
          element: `img[src="${img.attributes['src'] || ''}"]`,
          recommendation: 'Add descriptive alt text or alt="" for decorative images',
          evidence: `Found <img> without alt attribute`,
          impactScore: 50,
        });
      }
    }

    return issues;
  }

  private detectDeadEnds(observation: PageObservation): FrictionIssue[] {
    const issues: FrictionIssue[] = [];
    const { elements, html } = observation;

    // Check for sections with no interactive elements (dead ends)
    const sections = elements.filter(e => e.tag === 'section' || (e.tag === 'main' && e.text));
    for (const section of sections) {
      // If a section has content but no buttons, links, or forms, it might be a dead end
      if (section.text && section.text.length > 50) {
        const sectionHtml = html.substring(
          html.indexOf(section.text?.substring(0, 30) || ''),
          html.indexOf(section.text?.substring(0, 30) || '') + 2000
        );
        if (sectionHtml && !/<(button|a|input|form)/i.test(sectionHtml)) {
          issues.push({
            id: `dead-end-${section.id || 'section'}`,
            severity: 'medium',
            category: 'dead-end',
            description: 'Content section with no clear next action',
            element: section.id ? `#${section.id}` : 'section',
            recommendation: 'Add a clear CTA or next step for the user',
            evidence: `Section contains text but no interactive elements (buttons, links, forms)`,
            impactScore: 55,
          });
        }
      }
    }

    // Check for error messages without recovery actions
    const errorPatterns = /class="[^"]*error[^"]*"[^>]*>([^<]*)/gi;
    let match;
    while ((match = errorPatterns.exec(html)) !== null) {
      const errorContext = html.substring(match.index, match.index + 500);
      if (!/<(button|a)/i.test(errorContext)) {
        issues.push({
          id: `dead-end-error-${match.index}`,
          severity: 'high',
          category: 'dead-end',
          description: 'Error message without recovery action',
          recommendation: 'Add a retry button or link to help the user recover',
          evidence: `Error message "${match[1]?.trim()}" has no associated action`,
          impactScore: 75,
        });
      }
    }

    return issues;
  }

  private detectHiddenStatus(observation: PageObservation): FrictionIssue[] {
    const issues: FrictionIssue[] = [];
    const { html } = observation;

    // Check for status indicators that are hidden or have display:none
    const hiddenStatusRegex = /style="[^"]*display:\s*none[^"]*"[^>]*class="[^"]*status[^"]*"/gi;
    let match;
    while ((match = hiddenStatusRegex.exec(html)) !== null) {
      issues.push({
        id: `hidden-status-${match.index}`,
        severity: 'high',
        category: 'hidden-status',
        description: 'Status indicator is hidden from view',
        recommendation: 'Make status indicators always visible or provide clear toggle',
        evidence: `Found status element with display:none`,
        impactScore: 65,
      });
    }

    // Check for loading states that might be permanently hidden
    const loadingRegex = /class="[^"]*loading[^"]*"[^>]*style="[^"]*display:\s*none/gi;
    while ((match = loadingRegex.exec(html)) !== null) {
      // This is fine if it's a loading indicator that hides after load
      // But flag if there's no corresponding visible state
    }

    return issues;
  }

  private detectMissingFeedback(observation: PageObservation): FrictionIssue[] {
    const issues: FrictionIssue[] = [];
    const { elements, html } = observation;

    // Check for forms without visible validation feedback
    const forms = elements.filter(e => e.tag === 'form');
    for (const form of forms) {
      // Check if form has any error/success message containers
      const formId = form.id || '';
      if (formId && !html.includes(`${formId}-error`) && !html.includes(`${formId}-success`)) {
        issues.push({
          id: `missing-feedback-form-${formId || 'unknown'}`,
          severity: 'medium',
          category: 'missing-feedback',
          description: 'Form without visible validation feedback mechanism',
          element: formId ? `#${formId}` : 'form',
          recommendation: 'Add error/success message containers near the form',
          evidence: `Form has no associated error or success message elements`,
          impactScore: 55,
        });
      }
    }

    // Check for buttons that might trigger async actions without loading indicators
    const asyncButtons = elements.filter(e =>
      e.tag === 'button' &&
      (e.text?.toLowerCase().includes('submit') ||
       e.text?.toLowerCase().includes('save') ||
       e.text?.toLowerCase().includes('send') ||
       e.text?.toLowerCase().includes('deploy'))
    );
    for (const btn of asyncButtons) {
      // Check if there's a loading/spinner near the button
      const btnText = btn.text || '';
      const btnContext = html.substring(
        Math.max(0, html.indexOf(btnText) - 200),
        html.indexOf(btnText) + 500
      );
      if (!/(spinner|loading|progress)/i.test(btnContext)) {
        issues.push({
          id: `missing-feedback-btn-${btn.id || btnText.substring(0, 10)}`,
          severity: 'low',
          category: 'missing-feedback',
          description: `Action button "${btnText}" may lack loading feedback`,
          element: btn.id ? `#${btn.id}` : `button:contains("${btnText}")`,
          recommendation: 'Add loading spinner or disabled state during async operations',
          evidence: `Button "${btnText}" has no nearby loading/spinner indicator`,
          impactScore: 40,
        });
      }
    }

    return issues;
  }

  private detectUnclearNavigation(observation: PageObservation): FrictionIssue[] {
    const issues: FrictionIssue[] = [];
    const { elements, html } = observation;

    // Check if there's a clear active state in navigation
    const navElements = elements.filter(e => e.tag === 'nav' || e.tag === 'a');
    const hasActiveIndicator = navElements.some(e =>
      e.classes.some(c => c.includes('active') || c.includes('current') || c.includes('selected'))
    );

    if (navElements.length > 0 && !hasActiveIndicator) {
      issues.push({
        id: 'unclear-nav-no-active',
        severity: 'medium',
        category: 'unclear-navigation',
        description: 'Navigation has no clear active/current page indicator',
        recommendation: 'Add visual active state (color, border, background) to current nav item',
        evidence: 'No navigation element has active/current/selected class',
        impactScore: 60,
      });
    }

    // Check for deeply nested navigation without breadcrumbs
    const headings = elements.filter(e => e.tag === 'heading');
    if (headings.length > 3 && !html.includes('breadcrumb')) {
      issues.push({
        id: 'unclear-nav-no-breadcrumbs',
        severity: 'low',
        category: 'unclear-navigation',
        description: 'Complex page structure without breadcrumb navigation',
        recommendation: 'Add breadcrumbs to help users understand their location',
        evidence: `Page has ${headings.length} heading levels but no breadcrumb navigation`,
        impactScore: 35,
      });
    }

    return issues;
  }

  private detectCognitiveOverload(observation: PageObservation): FrictionIssue[] {
    const issues: FrictionIssue[] = [];
    const { elements, html } = observation;

    // Count interactive elements — too many = cognitive overload
    const interactiveCount = elements.filter(e =>
      e.tag === 'button' || e.tag === 'input' || e.tag === 'a'
    ).length;

    if (interactiveCount > 30) {
      issues.push({
        id: 'cognitive-overload-interactive',
        severity: 'high',
        category: 'cognitive-overload',
        description: `Page has ${interactiveCount} interactive elements — cognitive overload risk`,
        recommendation: 'Group related actions, use progressive disclosure, or split into sub-pages',
        evidence: `Found ${interactiveCount} buttons/inputs/links on a single page`,
        impactScore: 70,
      });
    } else if (interactiveCount > 20) {
      issues.push({
        id: 'cognitive-overload-interactive',
        severity: 'medium',
        category: 'cognitive-overload',
        description: `Page has ${interactiveCount} interactive elements — moderate cognitive load`,
        recommendation: 'Consider grouping related actions or using tabs/accordions',
        evidence: `Found ${interactiveCount} buttons/inputs/links on a single page`,
        impactScore: 50,
      });
    }

    // Check for too much text without visual breaks
    const textLength = html.replace(/<[^>]*>/g, '').length;
    const headingCount = elements.filter(e => e.tag === 'heading').length;
    if (textLength > 5000 && headingCount < 3) {
      issues.push({
        id: 'cognitive-overload-text',
        severity: 'medium',
        category: 'cognitive-overload',
        description: 'Large amount of text without sufficient visual structure',
        recommendation: 'Break content into sections with clear headings and visual separators',
        evidence: `${textLength} characters of text with only ${headingCount} headings`,
        impactScore: 55,
      });
    }

    return issues;
  }

  private detectPoorHierarchy(observation: PageObservation): FrictionIssue[] {
    const issues: FrictionIssue[] = [];
    const { elements } = observation;

    // Check heading hierarchy (h1 → h2 → h3, no skipping)
    const headings = elements.filter(e => e.tag === 'heading');
    // This is a simplified check — in real DOM we'd check actual h1-h6 levels

    // Check if there's a clear primary action (one prominent CTA)
    const buttons = elements.filter(e => e.tag === 'button');
    const primaryButtons = buttons.filter(e =>
      e.classes.some(c => c.includes('primary') || c.includes('cta') || c.includes('main'))
    );

    if (buttons.length > 3 && primaryButtons.length === 0) {
      issues.push({
        id: 'poor-hierarchy-no-primary-cta',
        severity: 'medium',
        category: 'poor-hierarchy',
        description: 'Multiple buttons but no clear primary action',
        recommendation: 'Designate one button as the primary CTA with distinct visual weight',
        evidence: `Found ${buttons.length} buttons but none with primary/cta styling`,
        impactScore: 55,
      });
    }

    return issues;
  }

  private detectAccessibilityIssues(observation: PageObservation): FrictionIssue[] {
    const issues: FrictionIssue[] = [];
    const { elements, html } = observation;

    // Check for role attributes on interactive elements
    const interactiveWithoutRole = elements.filter(e =>
      (e.tag === 'button' || e.tag === 'input') && !e.role && !e.ariaLabel
    );

    if (interactiveWithoutRole.length > 5) {
      issues.push({
        id: 'accessibility-missing-roles',
        severity: 'medium',
        category: 'accessibility',
        description: `${interactiveWithoutRole.length} interactive elements without ARIA roles or labels`,
        recommendation: 'Add appropriate role and aria-label attributes for screen reader support',
        evidence: `Found ${interactiveWithoutRole.length} buttons/inputs without role or aria-label`,
        impactScore: 60,
      });
    }

    // Check for color contrast issues (simplified — check for very light text)
    const lightTextRegex = /color:\s*#[def][def][def]|color:\s*rgb\(\s*2[0-5]\d/gi;
    if (lightTextRegex.test(html)) {
      issues.push({
        id: 'accessibility-contrast',
        severity: 'medium',
        category: 'accessibility',
        description: 'Potential low contrast text detected',
        recommendation: 'Ensure text meets WCAG AA contrast ratio (4.5:1 for normal text)',
        evidence: 'Found very light color values applied to text elements',
        impactScore: 55,
      });
    }

    return issues;
  }

  private detectEmptyStates(observation: PageObservation): FrictionIssue[] {
    const issues: FrictionIssue[] = [];
    const { html } = observation;

    // Check for "no data" or empty indicators without helpful guidance
    const emptyPatterns = [
      /no\s+data/gi,
      /nothing\s+here/gi,
      /empty/gi,
      /no\s+results/gi,
      /no\s+items/gi,
    ];

    for (const pattern of emptyPatterns) {
      const match = pattern.exec(html);
      if (match) {
        const context = html.substring(Math.max(0, match.index - 100), match.index + 300);
        // Check if there's a helpful action nearby
        if (!/<(button|a)/i.test(context)) {
          issues.push({
            id: `empty-state-${match.index}`,
            severity: 'medium',
            category: 'empty-state',
            description: 'Empty state without helpful guidance or action',
            recommendation: 'Add a helpful message explaining why it\'s empty and what action to take',
            evidence: `Found "${match[0]}" text without associated action or guidance`,
            impactScore: 50,
          });
        }
      }
    }

    return issues;
  }

  private detectErrorHandling(observation: PageObservation): FrictionIssue[] {
    const issues: FrictionIssue[] = [];
    const { consoleErrors } = observation;

    // Flag any console errors
    for (const error of consoleErrors) {
      issues.push({
        id: `console-error-${error.substring(0, 20)}`,
        severity: 'high',
        category: 'error-handling',
        description: `Console error detected: ${error.substring(0, 100)}`,
        recommendation: 'Fix the underlying error or add proper error boundary',
        evidence: error,
        impactScore: 70,
      });
    }

    return issues;
  }

  // -------------------------------------------------------------------------
  // Scoring
  // -------------------------------------------------------------------------

  private calculateCognitiveLoad(observation: PageObservation): number {
    const { elements, html } = observation;
    let score = 0;

    // More interactive elements = higher cognitive load
    const interactiveCount = elements.filter(e =>
      e.tag === 'button' || e.tag === 'input' || e.tag === 'a'
    ).length;
    score += Math.min(40, interactiveCount * 2);

    // More text = higher cognitive load
    const textLength = html.replace(/<[^>]*>/g, '').length;
    score += Math.min(30, Math.floor(textLength / 500));

    // Fewer headings relative to content = higher cognitive load
    const headingCount = elements.filter(e => e.tag === 'heading').length;
    if (textLength > 2000 && headingCount < 3) {
      score += 20;
    }

    // Many different element types = higher cognitive load
    const uniqueTags = new Set(elements.map(e => e.tag)).size;
    score += Math.min(10, uniqueTags);

    return Math.min(100, score);
  }

  private calculateHierarchyScore(observation: PageObservation): number {
    const { elements } = observation;
    let score = 100;

    // Deduct for missing headings
    const headings = elements.filter(e => e.tag === 'heading');
    if (headings.length === 0) score -= 30;
    else if (headings.length < 2) score -= 15;

    // Deduct for no clear primary action
    const buttons = elements.filter(e => e.tag === 'button');
    const hasPrimary = buttons.some(e =>
      e.classes.some(c => c.includes('primary') || c.includes('cta'))
    );
    if (buttons.length > 0 && !hasPrimary) score -= 20;

    // Deduct for no navigation structure
    const hasNav = elements.some(e => e.tag === 'nav');
    if (!hasNav) score -= 15;

    // Deduct for no semantic sections
    const hasSections = elements.some(e => e.tag === 'section');
    if (!hasSections) score -= 10;

    return Math.max(0, score);
  }
}

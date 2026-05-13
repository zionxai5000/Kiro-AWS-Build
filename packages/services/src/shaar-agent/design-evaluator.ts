/**
 * Shaar Agent — UI/UX Design Evaluator
 *
 * Evaluates visual design quality from DOM/CSS analysis:
 * - Layout quality and consistency
 * - Visual hierarchy effectiveness
 * - Spacing and alignment
 * - Typography quality
 * - Color usage and contrast
 * - CTA effectiveness
 * - Navigation clarity
 * - Empty/loading/error state handling
 */

import type { PageObservation, DOMElement } from './browser-observer.js';

export interface DesignIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: DesignCategory;
  description: string;
  recommendation: string;
  evidence: string;
  designPrinciple: string;
  impactScore: number;
}

export type DesignCategory =
  | 'layout'
  | 'hierarchy'
  | 'spacing'
  | 'typography'
  | 'color'
  | 'cta'
  | 'navigation'
  | 'states'
  | 'consistency'
  | 'responsiveness';

export interface DesignReport {
  pageUrl: string;
  timestamp: string;
  overallDesignScore: number; // 0-100
  categoryScores: Record<DesignCategory, number>;
  issues: DesignIssue[];
  strengths: string[];
  recommendations: DesignRecommendation[];
}

export interface DesignRecommendation {
  priority: number; // 1 = highest
  title: string;
  description: string;
  category: DesignCategory;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

export class DesignEvaluator {
  /**
   * Evaluate the visual design quality of a page.
   */
  evaluate(observation: PageObservation): DesignReport {
    const issues: DesignIssue[] = [];
    const strengths: string[] = [];

    // Run all design evaluators
    issues.push(...this.evaluateLayout(observation));
    issues.push(...this.evaluateHierarchy(observation));
    issues.push(...this.evaluateSpacing(observation));
    issues.push(...this.evaluateTypography(observation));
    issues.push(...this.evaluateColor(observation));
    issues.push(...this.evaluateCTAs(observation));
    issues.push(...this.evaluateNavigation(observation));
    issues.push(...this.evaluateStates(observation));
    issues.push(...this.evaluateConsistency(observation));

    // Identify strengths
    strengths.push(...this.identifyStrengths(observation));

    // Calculate category scores
    const categoryScores = this.calculateCategoryScores(issues);

    // Calculate overall score
    const overallDesignScore = Math.round(
      Object.values(categoryScores).reduce((sum, s) => sum + s, 0) / Object.keys(categoryScores).length
    );

    // Generate prioritized recommendations
    const recommendations = this.generateRecommendations(issues);

    return {
      pageUrl: observation.url,
      timestamp: observation.timestamp,
      overallDesignScore,
      categoryScores,
      issues,
      strengths,
      recommendations,
    };
  }

  // -------------------------------------------------------------------------
  // Design Evaluators
  // -------------------------------------------------------------------------

  private evaluateLayout(observation: PageObservation): DesignIssue[] {
    const issues: DesignIssue[] = [];
    const { html, elements } = observation;

    // Check for grid/flex layout usage (modern layout)
    const hasGrid = /display:\s*grid|grid-template/i.test(html);
    const hasFlex = /display:\s*flex/i.test(html);

    if (!hasGrid && !hasFlex) {
      issues.push({
        id: 'layout-no-modern',
        severity: 'medium',
        category: 'layout',
        description: 'No modern CSS layout (grid/flexbox) detected',
        recommendation: 'Use CSS Grid or Flexbox for consistent, responsive layouts',
        evidence: 'No display:grid or display:flex found in page styles',
        designPrinciple: 'Modern layouts provide better alignment and responsiveness',
        impactScore: 50,
      });
    }

    // Check for fixed widths that might break responsiveness
    const fixedWidthRegex = /width:\s*\d{4,}px/gi;
    if (fixedWidthRegex.test(html)) {
      issues.push({
        id: 'layout-fixed-width',
        severity: 'medium',
        category: 'layout',
        description: 'Large fixed pixel widths detected — may break on smaller screens',
        recommendation: 'Use relative units (%, vw, rem) or max-width instead of fixed px',
        evidence: 'Found width values over 1000px in inline styles',
        designPrinciple: 'Responsive design requires fluid layouts',
        impactScore: 55,
      });
    }

    // Check for proper main content area
    const hasMain = elements.some(e => e.tag === 'main');
    if (!hasMain) {
      issues.push({
        id: 'layout-no-main',
        severity: 'low',
        category: 'layout',
        description: 'No <main> landmark element found',
        recommendation: 'Wrap primary content in a <main> element for accessibility and structure',
        evidence: 'Page lacks a <main> semantic element',
        designPrinciple: 'Semantic HTML improves accessibility and document structure',
        impactScore: 30,
      });
    }

    return issues;
  }

  private evaluateHierarchy(observation: PageObservation): DesignIssue[] {
    const issues: DesignIssue[] = [];
    const { elements, html } = observation;

    // Check heading structure
    const headings = elements.filter(e => e.tag === 'heading');
    if (headings.length === 0) {
      issues.push({
        id: 'hierarchy-no-headings',
        severity: 'high',
        category: 'hierarchy',
        description: 'Page has no heading elements — unclear content hierarchy',
        recommendation: 'Add h1 for page title, h2 for sections, h3 for subsections',
        evidence: 'No <h1>-<h6> elements found on the page',
        designPrinciple: 'Visual hierarchy guides the eye and communicates importance',
        impactScore: 70,
      });
    }

    // Check for visual weight distribution
    const buttons = elements.filter(e => e.tag === 'button');
    const links = elements.filter(e => e.tag === 'a');
    const totalActions = buttons.length + links.length;

    if (totalActions > 10) {
      // Check if actions are grouped or scattered
      issues.push({
        id: 'hierarchy-action-density',
        severity: 'low',
        category: 'hierarchy',
        description: `${totalActions} action elements — ensure clear visual priority`,
        recommendation: 'Use size, color, and position to establish action hierarchy',
        evidence: `Found ${buttons.length} buttons and ${links.length} links`,
        designPrinciple: 'Not all actions are equal — primary actions need visual prominence',
        impactScore: 40,
      });
    }

    return issues;
  }

  private evaluateSpacing(observation: PageObservation): DesignIssue[] {
    const issues: DesignIssue[] = [];
    const { html } = observation;

    // Check for inconsistent spacing values
    const marginValues = new Set<string>();
    const paddingValues = new Set<string>();
    const marginRegex = /margin[^:]*:\s*([^;]+)/gi;
    const paddingRegex = /padding[^:]*:\s*([^;]+)/gi;

    let match;
    while ((match = marginRegex.exec(html)) !== null) {
      marginValues.add(match[1].trim());
    }
    while ((match = paddingRegex.exec(html)) !== null) {
      paddingValues.add(match[1].trim());
    }

    // If there are many unique spacing values, spacing might be inconsistent
    if (marginValues.size > 10 || paddingValues.size > 10) {
      issues.push({
        id: 'spacing-inconsistent',
        severity: 'low',
        category: 'spacing',
        description: 'Many unique spacing values detected — may indicate inconsistent spacing system',
        recommendation: 'Use a spacing scale (4px, 8px, 16px, 24px, 32px, 48px) for consistency',
        evidence: `Found ${marginValues.size} unique margin values and ${paddingValues.size} unique padding values`,
        designPrinciple: 'Consistent spacing creates visual rhythm and professionalism',
        impactScore: 35,
      });
    }

    return issues;
  }

  private evaluateTypography(observation: PageObservation): DesignIssue[] {
    const issues: DesignIssue[] = [];
    const { html } = observation;

    // Check for too many font sizes
    const fontSizes = new Set<string>();
    const fontSizeRegex = /font-size:\s*([^;]+)/gi;
    let match;
    while ((match = fontSizeRegex.exec(html)) !== null) {
      fontSizes.add(match[1].trim());
    }

    if (fontSizes.size > 8) {
      issues.push({
        id: 'typography-too-many-sizes',
        severity: 'medium',
        category: 'typography',
        description: `${fontSizes.size} different font sizes — too many for a cohesive type scale`,
        recommendation: 'Limit to 5-7 font sizes in a clear type scale (e.g., 12, 14, 16, 20, 24, 32, 48)',
        evidence: `Found ${fontSizes.size} unique font-size values`,
        designPrinciple: 'A limited type scale creates visual consistency and hierarchy',
        impactScore: 45,
      });
    }

    // Check for very small font sizes
    const smallFontRegex = /font-size:\s*(0\.\d+rem|[0-9]px|1[01]px)/gi;
    if (smallFontRegex.test(html)) {
      issues.push({
        id: 'typography-too-small',
        severity: 'medium',
        category: 'typography',
        description: 'Very small font sizes detected (below 12px)',
        recommendation: 'Minimum body text should be 14px (0.875rem), prefer 16px (1rem)',
        evidence: 'Found font-size values below 12px',
        designPrinciple: 'Readability requires minimum 14px for body text',
        impactScore: 50,
      });
    }

    // Check for font-family declarations (too many = inconsistent)
    const fontFamilies = new Set<string>();
    const fontFamilyRegex = /font-family:\s*([^;]+)/gi;
    while ((match = fontFamilyRegex.exec(html)) !== null) {
      fontFamilies.add(match[1].trim().split(',')[0].trim());
    }

    if (fontFamilies.size > 3) {
      issues.push({
        id: 'typography-too-many-fonts',
        severity: 'medium',
        category: 'typography',
        description: `${fontFamilies.size} different font families — too many`,
        recommendation: 'Use 1-2 font families maximum (one for headings, one for body)',
        evidence: `Found font families: ${[...fontFamilies].join(', ')}`,
        designPrinciple: 'Fewer fonts = more cohesive, professional appearance',
        impactScore: 45,
      });
    }

    return issues;
  }

  private evaluateColor(observation: PageObservation): DesignIssue[] {
    const issues: DesignIssue[] = [];
    const { html } = observation;

    // Extract color values
    const colors = new Set<string>();
    const colorRegex = /(?:color|background(?:-color)?)\s*:\s*(#[0-9a-f]{3,8}|rgb[a]?\([^)]+\)|[a-z]+)/gi;
    let match;
    while ((match = colorRegex.exec(html)) !== null) {
      colors.add(match[1].toLowerCase());
    }

    if (colors.size > 15) {
      issues.push({
        id: 'color-too-many',
        severity: 'medium',
        category: 'color',
        description: `${colors.size} unique colors — may indicate lack of color system`,
        recommendation: 'Define a color palette with primary, secondary, accent, and neutral colors (8-12 total)',
        evidence: `Found ${colors.size} unique color values in styles`,
        designPrinciple: 'A defined color palette creates brand consistency and visual harmony',
        impactScore: 45,
      });
    }

    return issues;
  }

  private evaluateCTAs(observation: PageObservation): DesignIssue[] {
    const issues: DesignIssue[] = [];
    const { elements } = observation;

    const buttons = elements.filter(e => e.tag === 'button');

    // Check for CTA clarity
    const vagueCTAs = buttons.filter(e => {
      const text = (e.text || '').toLowerCase();
      return text === 'click here' || text === 'submit' || text === 'ok' || text === 'go';
    });

    if (vagueCTAs.length > 0) {
      issues.push({
        id: 'cta-vague-labels',
        severity: 'medium',
        category: 'cta',
        description: `${vagueCTAs.length} buttons with vague labels (click here, submit, ok)`,
        recommendation: 'Use action-specific labels: "Save Changes", "Deploy App", "Start Review"',
        evidence: `Found buttons with generic labels: ${vagueCTAs.map(b => b.text).join(', ')}`,
        designPrinciple: 'CTAs should clearly communicate what will happen when clicked',
        impactScore: 55,
      });
    }

    // Check for too many equally-weighted CTAs
    if (buttons.length > 5) {
      const allSameWeight = buttons.every(b =>
        b.classes.join(' ') === buttons[0].classes.join(' ')
      );
      if (allSameWeight) {
        issues.push({
          id: 'cta-no-hierarchy',
          severity: 'medium',
          category: 'cta',
          description: 'Multiple buttons with identical visual weight — no clear primary action',
          recommendation: 'Differentiate primary (filled), secondary (outlined), and tertiary (text) buttons',
          evidence: `${buttons.length} buttons all share the same styling`,
          designPrinciple: 'Button hierarchy guides users toward the most important action',
          impactScore: 55,
        });
      }
    }

    return issues;
  }

  private evaluateNavigation(observation: PageObservation): DesignIssue[] {
    const issues: DesignIssue[] = [];
    const { elements, html } = observation;

    // Check for navigation presence
    const hasNav = elements.some(e => e.tag === 'nav');
    if (!hasNav && !html.includes('nav-')) {
      issues.push({
        id: 'navigation-missing',
        severity: 'high',
        category: 'navigation',
        description: 'No navigation element detected on the page',
        recommendation: 'Add clear navigation with semantic <nav> element',
        evidence: 'No <nav> element or nav-prefixed classes found',
        designPrinciple: 'Users need clear wayfinding to navigate complex applications',
        impactScore: 70,
      });
    }

    return issues;
  }

  private evaluateStates(observation: PageObservation): DesignIssue[] {
    const issues: DesignIssue[] = [];
    const { html } = observation;

    // Check for loading state handling
    const hasLoadingState = /loading|spinner|skeleton/i.test(html);
    // Check for error state handling
    const hasErrorState = /error|alert|warning/i.test(html);
    // Check for empty state handling
    const hasEmptyState = /empty|no-data|no-results/i.test(html);

    if (!hasLoadingState) {
      issues.push({
        id: 'states-no-loading',
        severity: 'medium',
        category: 'states',
        description: 'No loading state indicators detected',
        recommendation: 'Add skeleton screens or spinners for async content',
        evidence: 'No loading/spinner/skeleton classes or elements found',
        designPrinciple: 'Users need feedback that content is loading',
        impactScore: 50,
      });
    }

    if (!hasErrorState) {
      issues.push({
        id: 'states-no-error',
        severity: 'medium',
        category: 'states',
        description: 'No error state handling detected',
        recommendation: 'Add error boundaries with helpful recovery messages',
        evidence: 'No error/alert/warning classes or elements found',
        designPrinciple: 'Graceful error handling builds user trust',
        impactScore: 50,
      });
    }

    return issues;
  }

  private evaluateConsistency(observation: PageObservation): DesignIssue[] {
    const issues: DesignIssue[] = [];
    const { elements } = observation;

    // Check for consistent button styling
    const buttons = elements.filter(e => e.tag === 'button');
    const buttonClassSets = buttons.map(b => b.classes.sort().join(' '));
    const uniqueButtonStyles = new Set(buttonClassSets).size;

    if (uniqueButtonStyles > 5) {
      issues.push({
        id: 'consistency-button-styles',
        severity: 'medium',
        category: 'consistency',
        description: `${uniqueButtonStyles} different button styles — inconsistent component usage`,
        recommendation: 'Standardize on 2-3 button variants (primary, secondary, ghost)',
        evidence: `Found ${uniqueButtonStyles} unique button class combinations`,
        designPrinciple: 'Consistent components reduce cognitive load and build familiarity',
        impactScore: 45,
      });
    }

    return issues;
  }

  // -------------------------------------------------------------------------
  // Strengths & Recommendations
  // -------------------------------------------------------------------------

  private identifyStrengths(observation: PageObservation): string[] {
    const strengths: string[] = [];
    const { elements, html } = observation;

    if (elements.some(e => e.tag === 'nav')) {
      strengths.push('Clear navigation structure present');
    }
    if (/display:\s*(grid|flex)/i.test(html)) {
      strengths.push('Modern CSS layout (grid/flexbox) in use');
    }
    if (elements.some(e => e.role || e.ariaLabel)) {
      strengths.push('ARIA attributes present for accessibility');
    }
    if (elements.filter(e => e.tag === 'heading').length >= 2) {
      strengths.push('Good heading structure for content hierarchy');
    }
    if (/dark|theme/i.test(html)) {
      strengths.push('Theme/dark mode support detected');
    }

    return strengths;
  }

  private calculateCategoryScores(issues: DesignIssue[]): Record<DesignCategory, number> {
    const categories: DesignCategory[] = [
      'layout', 'hierarchy', 'spacing', 'typography', 'color',
      'cta', 'navigation', 'states', 'consistency', 'responsiveness',
    ];

    const scores: Record<DesignCategory, number> = {} as any;

    for (const cat of categories) {
      const catIssues = issues.filter(i => i.category === cat);
      if (catIssues.length === 0) {
        scores[cat] = 90; // No issues = good score (not perfect, can't verify everything)
      } else {
        const avgImpact = catIssues.reduce((sum, i) => sum + i.impactScore, 0) / catIssues.length;
        scores[cat] = Math.max(0, Math.round(100 - avgImpact));
      }
    }

    return scores;
  }

  private generateRecommendations(issues: DesignIssue[]): DesignRecommendation[] {
    // Sort issues by impact and generate top recommendations
    const sorted = [...issues].sort((a, b) => b.impactScore - a.impactScore);
    const top = sorted.slice(0, 5);

    return top.map((issue, idx) => ({
      priority: idx + 1,
      title: issue.description,
      description: issue.recommendation,
      category: issue.category,
      effort: issue.impactScore > 60 ? 'medium' : 'low',
      impact: issue.severity === 'critical' || issue.severity === 'high' ? 'high' : 'medium',
    }));
  }
}

/**
 * ZionX Design Excellence — Template Library
 *
 * Maintains a versioned library of production-quality UI templates organized
 * by app category. Templates include complete screen flows, component variants,
 * and interaction patterns. Templates are living artifacts that auto-update
 * when design intelligence detects new market trends.
 *
 * Requirements: 11c.2
 */

import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { AppCategory, DesignIntelligenceEngine, UIPattern } from './design-intelligence.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScreenTemplate {
  id: string;
  name: string;
  type: 'onboarding' | 'home' | 'settings' | 'paywall' | 'empty_state' | 'error_state' | 'detail' | 'list' | 'profile';
  description: string;
  layoutStructure: LayoutNode;
  components: ComponentReference[];
  interactionPatterns: string[];
}

export interface LayoutNode {
  type: 'stack' | 'row' | 'grid' | 'scroll' | 'tab' | 'modal' | 'bottom_sheet';
  children?: LayoutNode[];
  componentRef?: string;
  properties: Record<string, unknown>;
}

export interface ComponentReference {
  id: string;
  type: 'card' | 'list_item' | 'modal' | 'bottom_sheet' | 'tab_bar' | 'header' | 'button' | 'input' | 'toggle' | 'badge' | 'avatar' | 'skeleton';
  variant: string;
  properties: Record<string, unknown>;
}

export interface InteractionPattern {
  name: string;
  type: 'swipe_gesture' | 'pull_to_refresh' | 'skeleton_loading' | 'haptic_feedback' | 'long_press' | 'drag_reorder';
  description: string;
  triggerCondition: string;
  animationSpec: Record<string, unknown>;
}

export interface UITemplate {
  id: string;
  name: string;
  version: string;
  category: AppCategory;
  screens: ScreenTemplate[];
  componentVariants: ComponentReference[];
  interactionPatterns: InteractionPattern[];
  derivedFromPatterns: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateLibraryState {
  templates: UITemplate[];
  totalTemplates: number;
  categoryCoverage: Record<AppCategory, number>;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Template Library
// ---------------------------------------------------------------------------

export class TemplateLibrary {
  private templates: Map<string, UITemplate> = new Map();

  constructor(
    private readonly designIntelligence: DesignIntelligenceEngine,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Get a template by category, optionally filtered by screen types.
   */
  getTemplate(category: AppCategory): UITemplate | undefined {
    return [...this.templates.values()].find((t) => t.category === category);
  }

  /**
   * Get all templates.
   */
  getAllTemplates(): UITemplate[] {
    return [...this.templates.values()];
  }

  /**
   * Generate or update templates for a category based on design intelligence.
   */
  async updateTemplatesForCategory(
    category: AppCategory,
    platform: 'ios' | 'android',
  ): Promise<UITemplate> {
    // 1. Get latest design intelligence
    const analysis = await this.designIntelligence.analyzeCategory(category, platform);

    // 2. Build template from patterns
    const template = this.buildTemplate(category, analysis.uiPatterns);

    // 3. Store in library
    this.templates.set(template.id, template);

    // 4. Persist to Zikaron
    await this.persistTemplate(template);

    return template;
  }

  /**
   * Auto-update all templates when design intelligence detects new trends.
   */
  async refreshAllTemplates(platform: 'ios' | 'android'): Promise<TemplateLibraryState> {
    const categories: AppCategory[] = ['wellness', 'productivity', 'finance', 'utility', 'gaming'];

    for (const category of categories) {
      await this.updateTemplatesForCategory(category, platform);
    }

    return this.getLibraryState();
  }

  /**
   * Get the current state of the template library.
   */
  getLibraryState(): TemplateLibraryState {
    const templates = this.getAllTemplates();
    const categoryCoverage: Record<string, number> = {};

    for (const template of templates) {
      categoryCoverage[template.category] = (categoryCoverage[template.category] ?? 0) + 1;
    }

    return {
      templates,
      totalTemplates: templates.length,
      categoryCoverage: categoryCoverage as Record<AppCategory, number>,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Build a complete UI template from extracted patterns.
   */
  private buildTemplate(category: AppCategory, patterns: UIPattern[]): UITemplate {
    const now = new Date().toISOString();
    const templateId = `template-${category}-${Date.now()}`;

    const screens = this.buildScreens(category);
    const componentVariants = this.buildComponentVariants();
    const interactionPatterns = this.buildInteractionPatterns();

    return {
      id: templateId,
      name: `${category.charAt(0).toUpperCase() + category.slice(1)} App Template`,
      version: '1.0.0',
      category,
      screens,
      componentVariants,
      interactionPatterns,
      derivedFromPatterns: patterns.map((p) => p.id),
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Build standard screen templates for a category.
   */
  private buildScreens(category: AppCategory): ScreenTemplate[] {
    return [
      {
        id: `screen-onboarding-${category}`,
        name: 'Onboarding Flow',
        type: 'onboarding',
        description: '3-5 step onboarding with illustrations and value proposition',
        layoutStructure: { type: 'stack', properties: { spacing: 24 }, children: [
          { type: 'stack', componentRef: 'illustration', properties: { flex: 1 } },
          { type: 'stack', componentRef: 'title-subtitle', properties: { padding: 24 } },
          { type: 'row', componentRef: 'page-dots', properties: { alignment: 'center' } },
          { type: 'stack', componentRef: 'cta-button', properties: { padding: 24 } },
        ]},
        components: [
          { id: 'onboarding-illustration', type: 'card', variant: 'illustration', properties: { aspectRatio: 1.5 } },
          { id: 'onboarding-cta', type: 'button', variant: 'primary', properties: { fullWidth: true } },
        ],
        interactionPatterns: ['swipe_gesture', 'haptic_feedback'],
      },
      {
        id: `screen-home-${category}`,
        name: 'Home Screen',
        type: 'home',
        description: 'Main app screen with content feed and navigation',
        layoutStructure: { type: 'stack', properties: { spacing: 16 }, children: [
          { type: 'row', componentRef: 'header', properties: { padding: 16 } },
          { type: 'scroll', componentRef: 'content-feed', properties: { flex: 1 } },
          { type: 'row', componentRef: 'tab-bar', properties: {} },
        ]},
        components: [
          { id: 'home-header', type: 'header', variant: 'with-avatar', properties: {} },
          { id: 'home-tab-bar', type: 'tab_bar', variant: 'bottom', properties: { tabs: 4 } },
          { id: 'home-card', type: 'card', variant: 'content', properties: { rounded: 12 } },
        ],
        interactionPatterns: ['pull_to_refresh', 'skeleton_loading'],
      },
      {
        id: `screen-settings-${category}`,
        name: 'Settings Screen',
        type: 'settings',
        description: 'Settings with grouped sections and toggles',
        layoutStructure: { type: 'scroll', properties: { padding: 16 }, children: [
          { type: 'stack', componentRef: 'profile-section', properties: {} },
          { type: 'stack', componentRef: 'settings-groups', properties: { spacing: 24 } },
        ]},
        components: [
          { id: 'settings-avatar', type: 'avatar', variant: 'large', properties: {} },
          { id: 'settings-toggle', type: 'toggle', variant: 'default', properties: {} },
          { id: 'settings-list-item', type: 'list_item', variant: 'navigation', properties: {} },
        ],
        interactionPatterns: ['haptic_feedback'],
      },
      {
        id: `screen-paywall-${category}`,
        name: 'Paywall Screen',
        type: 'paywall',
        description: 'Subscription paywall with pricing tiers and social proof',
        layoutStructure: { type: 'stack', properties: { spacing: 16 }, children: [
          { type: 'stack', componentRef: 'close-button', properties: { alignment: 'trailing' } },
          { type: 'stack', componentRef: 'value-prop', properties: { padding: 24 } },
          { type: 'stack', componentRef: 'pricing-tiers', properties: { padding: 16 } },
          { type: 'stack', componentRef: 'social-proof', properties: {} },
          { type: 'stack', componentRef: 'subscribe-button', properties: { padding: 24 } },
        ]},
        components: [
          { id: 'paywall-tier', type: 'card', variant: 'pricing', properties: { selectable: true } },
          { id: 'paywall-badge', type: 'badge', variant: 'popular', properties: {} },
          { id: 'paywall-cta', type: 'button', variant: 'primary', properties: { fullWidth: true } },
        ],
        interactionPatterns: ['haptic_feedback'],
      },
      {
        id: `screen-empty-${category}`,
        name: 'Empty State',
        type: 'empty_state',
        description: 'Empty state with illustration and action prompt',
        layoutStructure: { type: 'stack', properties: { alignment: 'center', spacing: 24 }, children: [
          { type: 'stack', componentRef: 'illustration', properties: {} },
          { type: 'stack', componentRef: 'message', properties: {} },
          { type: 'stack', componentRef: 'action-button', properties: {} },
        ]},
        components: [
          { id: 'empty-illustration', type: 'card', variant: 'illustration', properties: {} },
          { id: 'empty-button', type: 'button', variant: 'secondary', properties: {} },
        ],
        interactionPatterns: [],
      },
      {
        id: `screen-error-${category}`,
        name: 'Error State',
        type: 'error_state',
        description: 'Error state with retry action',
        layoutStructure: { type: 'stack', properties: { alignment: 'center', spacing: 16 }, children: [
          { type: 'stack', componentRef: 'error-icon', properties: {} },
          { type: 'stack', componentRef: 'error-message', properties: {} },
          { type: 'stack', componentRef: 'retry-button', properties: {} },
        ]},
        components: [
          { id: 'error-button', type: 'button', variant: 'primary', properties: {} },
        ],
        interactionPatterns: ['haptic_feedback'],
      },
    ];
  }

  /**
   * Build standard component variants.
   */
  private buildComponentVariants(): ComponentReference[] {
    return [
      { id: 'card-content', type: 'card', variant: 'content', properties: { borderRadius: 12, shadow: 'sm', padding: 16 } },
      { id: 'card-pricing', type: 'card', variant: 'pricing', properties: { borderRadius: 16, border: true, selectable: true } },
      { id: 'list-item-nav', type: 'list_item', variant: 'navigation', properties: { chevron: true, divider: true } },
      { id: 'modal-default', type: 'modal', variant: 'center', properties: { borderRadius: 20, dimBackground: true } },
      { id: 'bottom-sheet', type: 'bottom_sheet', variant: 'default', properties: { handleBar: true, borderRadius: 20 } },
      { id: 'tab-bar-bottom', type: 'tab_bar', variant: 'bottom', properties: { tabs: 4, activeIndicator: 'filled' } },
      { id: 'skeleton-card', type: 'skeleton', variant: 'card', properties: { shimmer: true } },
      { id: 'skeleton-list', type: 'skeleton', variant: 'list', properties: { shimmer: true, rows: 5 } },
    ];
  }

  /**
   * Build standard interaction patterns.
   */
  private buildInteractionPatterns(): InteractionPattern[] {
    return [
      {
        name: 'Swipe Gesture',
        type: 'swipe_gesture',
        description: 'Horizontal swipe to reveal actions or navigate',
        triggerCondition: 'horizontal_pan > 50px',
        animationSpec: { duration: 200, easing: 'ease-out', overshoot: false },
      },
      {
        name: 'Pull to Refresh',
        type: 'pull_to_refresh',
        description: 'Pull down to refresh content with spinner',
        triggerCondition: 'vertical_pan_down > 80px at scroll_top',
        animationSpec: { duration: 300, easing: 'spring', spinnerStyle: 'circular' },
      },
      {
        name: 'Skeleton Loading',
        type: 'skeleton_loading',
        description: 'Shimmer skeleton placeholders during data load',
        triggerCondition: 'data_loading === true',
        animationSpec: { duration: 1500, easing: 'linear', shimmerAngle: 20 },
      },
      {
        name: 'Haptic Feedback',
        type: 'haptic_feedback',
        description: 'Light haptic on interactive element activation',
        triggerCondition: 'element_pressed',
        animationSpec: { type: 'light', duration: 10 },
      },
    ];
  }

  /**
   * Persist template to Zikaron.
   */
  private async persistTemplate(template: UITemplate): Promise<void> {
    await this.zikaronService.storeProcedural({
      id: `template-${template.id}`,
      tenantId: 'system',
      layer: 'procedural',
      content: `UI template "${template.name}" v${template.version} for ${template.category}: ${template.screens.length} screens`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['template', template.category, template.version],
      createdAt: new Date(),
      workflowPattern: `template_${template.category}`,
      successRate: 1.0,
      executionCount: 1,
      prerequisites: ['design_intelligence_analysis'],
      steps: template.screens.map((s, idx) => ({
        order: idx + 1,
        action: `render_${s.type}`,
        description: s.description,
        expectedOutcome: `Screen "${s.name}" rendered`,
      })),
    });
  }
}

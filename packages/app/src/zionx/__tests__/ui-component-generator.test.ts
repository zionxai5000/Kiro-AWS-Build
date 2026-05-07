/**
 * Unit tests for ZionX Design Excellence — UI Component Generator
 *
 * Validates: Requirements 11c.5, 19.1
 *
 * Tests custom component generation with micro-interactions, WCAG 2.1 AA
 * accessibility compliance checks, transition and haptic feedback specs,
 * accessibility report generation, platform hints, and persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIComponentGenerator } from '../design/ui-component-generator.js';
import type {
  UIComponentSpec,
  ComponentGenerationResult,
  AccessibilityReport,
  AccessibilityIssue,
} from '../design/ui-component-generator.js';
import type { DesignSystem, ColorPalette, TypographyScale, SpacingSystem, IconographySpec, AnimationSpec, ComponentSpec } from '../design/design-system-generator.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockZikaronService(): ZikaronService {
  return {
    storeEpisodic: vi.fn(async () => 'id'),
    storeSemantic: vi.fn(async () => 'id'),
    storeProcedural: vi.fn(async () => 'id'),
    storeWorking: vi.fn(async () => 'id'),
    query: vi.fn(async () => []),
    queryByAgent: vi.fn(async () => []),
    loadAgentContext: vi.fn(async () => ({ agentId: '', episodic: [], semantic: [], procedural: [], working: null })),
    flagConflict: vi.fn(async () => {}),
  } as unknown as ZikaronService;
}

function createMockDesignSystem(overrides?: Partial<DesignSystem>): DesignSystem {
  return {
    id: 'ds-test-1',
    appId: 'test-app',
    appName: 'TestApp',
    version: '1.0.0',
    category: 'wellness',
    colorPalette: {
      primary: '#4CAF50',
      primaryLight: '#81C784',
      primaryDark: '#388E3C',
      secondary: '#FF9800',
      secondaryLight: '#FFB74D',
      secondaryDark: '#F57C00',
      accent: '#03A9F4',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      error: '#F44336',
      warning: '#FF9800',
      success: '#4CAF50',
      info: '#2196F3',
      textPrimary: '#212121',
      textSecondary: '#757575',
      textDisabled: '#BDBDBD',
      divider: '#E0E0E0',
    },
    typography: {
      fontFamily: { primary: 'SF Pro Rounded', secondary: 'Nunito', mono: 'SF Mono' },
      sizes: {
        h1: { size: 34, lineHeight: 41, weight: 700, letterSpacing: 0.37 },
        h2: { size: 28, lineHeight: 34, weight: 700, letterSpacing: 0.36 },
        h3: { size: 22, lineHeight: 28, weight: 600, letterSpacing: 0.35 },
        h4: { size: 20, lineHeight: 25, weight: 600, letterSpacing: 0.38 },
        body1: { size: 17, lineHeight: 22, weight: 400, letterSpacing: -0.41 },
        body2: { size: 15, lineHeight: 20, weight: 400, letterSpacing: -0.24 },
        caption: { size: 12, lineHeight: 16, weight: 400, letterSpacing: 0 },
        button: { size: 17, lineHeight: 22, weight: 600, letterSpacing: -0.41 },
        overline: { size: 10, lineHeight: 13, weight: 600, letterSpacing: 1.5 },
      },
    },
    spacing: {
      unit: 4,
      scale: { xxs: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 },
      borderRadius: { none: 0, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20, full: 9999 },
    },
    iconography: { style: 'rounded', size: { sm: 16, md: 24, lg: 32, xl: 48 }, strokeWidth: 1.5, cornerRadius: 2 },
    animations: {
      durations: { fast: 150, normal: 300, slow: 500 },
      easings: { standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)', decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)', accelerate: 'cubic-bezier(0.4, 0.0, 1, 1)', spring: 'spring(1, 80, 10, 0)' },
      transitions: {
        pageEnter: { duration: 300, easing: 'decelerate', type: 'slide_up' },
        pageExit: { duration: 250, easing: 'accelerate', type: 'fade_out' },
        elementEnter: { duration: 200, easing: 'decelerate', type: 'fade_in_up' },
        elementExit: { duration: 150, easing: 'accelerate', type: 'fade_out' },
      },
    },
    components: [],
    similarityScore: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UIComponentGenerator', () => {
  let generator: UIComponentGenerator;
  let mockZikaron: ZikaronService;
  let designSystem: DesignSystem;

  beforeEach(() => {
    mockZikaron = createMockZikaronService();
    generator = new UIComponentGenerator(mockZikaron);
    designSystem = createMockDesignSystem();
  });

  // -------------------------------------------------------------------------
  // Custom component generation with micro-interactions
  // -------------------------------------------------------------------------

  describe('generateComponents() — custom components', () => {
    it('should generate 10 custom components', async () => {
      const result = await generator.generateComponents(designSystem);

      expect(result.components).toHaveLength(10);
      expect(result.generatedAt).toBeTruthy();
    });

    it('should generate all 10 named components: Button, Card, Input, Toggle, ListItem, BottomSheet, TabBar, Badge, Avatar, Snackbar', async () => {
      const result = await generator.generateComponents(designSystem);
      const names = result.components.map((c) => c.name);

      expect(names).toContain('Button');
      expect(names).toContain('Card');
      expect(names).toContain('Input');
      expect(names).toContain('Toggle');
      expect(names).toContain('ListItem');
      expect(names).toContain('BottomSheet');
      expect(names).toContain('TabBar');
      expect(names).toContain('Badge');
      expect(names).toContain('Avatar');
      expect(names).toContain('Snackbar');
    });

    it('should generate components with unique types', async () => {
      const result = await generator.generateComponents(designSystem);
      const types = result.components.map((c) => c.type);

      expect(types).toContain('button');
      expect(types).toContain('card');
      expect(types).toContain('input');
      expect(types).toContain('toggle');
      expect(types).toContain('list_item');
      expect(types).toContain('bottom_sheet');
      expect(types).toContain('tab_bar');
      expect(types).toContain('badge');
      expect(types).toContain('avatar');
      expect(types).toContain('snackbar');
    });

    it('each component should have micro-interactions', async () => {
      const result = await generator.generateComponents(designSystem);

      for (const comp of result.components) {
        expect(comp.microInteractions.length).toBeGreaterThan(0);

        for (const interaction of comp.microInteractions) {
          expect(interaction.trigger).toBeTruthy();
          expect(interaction.animation).toBeDefined();
          expect(interaction.animation.type).toBeTruthy();
          expect(interaction.animation.duration).toBeGreaterThan(0);
          expect(interaction.animation.easing).toBeTruthy();
        }
      }
    });

    it('button component should have haptic feedback on press', async () => {
      const result = await generator.generateComponents(designSystem);
      const button = result.components.find((c) => c.type === 'button')!;

      const pressInteraction = button.microInteractions.find((i) => i.trigger === 'press_down');
      expect(pressInteraction).toBeDefined();
      expect(pressInteraction!.hapticFeedback).toBeDefined();
      expect(pressInteraction!.hapticFeedback!.type).toBe('light');
      expect(pressInteraction!.hapticFeedback!.intensity).toBeGreaterThan(0);
    });

    it('haptic feedback should be optional — some interactions may omit it', async () => {
      const result = await generator.generateComponents(designSystem);
      const button = result.components.find((c) => c.type === 'button')!;

      // Button has press_up without haptic feedback
      const releaseInteraction = button.microInteractions.find((i) => i.trigger === 'press_up');
      expect(releaseInteraction).toBeDefined();
      expect(releaseInteraction!.hapticFeedback).toBeUndefined();
    });

    it('each component should have multiple states', async () => {
      const result = await generator.generateComponents(designSystem);

      for (const comp of result.components) {
        expect(comp.states.default).toBeDefined();
        expect(comp.states.pressed).toBeDefined();
        expect(comp.states.disabled).toBeDefined();
        expect(comp.states.focused).toBeDefined();
      }
    });
  });

  // -------------------------------------------------------------------------
  // WCAG 2.1 AA accessibility compliance
  // -------------------------------------------------------------------------

  describe('auditAccessibility() — WCAG 2.1 AA', () => {
    it('should produce an accessibility report at AA level', async () => {
      const result = await generator.generateComponents(designSystem);

      expect(result.accessibilityReport.level).toBe('AA');
      expect(result.accessibilityReport.totalComponents).toBe(10);
    });

    it('should include all required report fields: totalComponents, compliantComponents, issues, overallCompliant', async () => {
      const result = await generator.generateComponents(designSystem);
      const report = result.accessibilityReport;

      expect(typeof report.totalComponents).toBe('number');
      expect(typeof report.compliantComponents).toBe('number');
      expect(Array.isArray(report.issues)).toBe(true);
      expect(typeof report.overallCompliant).toBe('boolean');
    });

    it('should report compliant components count', async () => {
      const result = await generator.generateComponents(designSystem);
      const report = result.accessibilityReport;

      expect(report.compliantComponents).toBeGreaterThanOrEqual(0);
      expect(report.compliantComponents).toBeLessThanOrEqual(report.totalComponents);
    });

    it('generated components should have contrast ratio >= 4.5 for normal text or be flagged in audit', async () => {
      const result = await generator.generateComponents(designSystem);

      for (const comp of result.components) {
        if (comp.accessibility.contrastRatio < 4.5) {
          // Components with low contrast should be flagged in the accessibility report
          const flagged = result.accessibilityReport.issues.some(
            (i) => i.componentId === comp.id && i.wcagCriterion === '1.4.3 Contrast (Minimum)',
          );
          expect(flagged).toBe(true);
        }
      }
    });

    it('generated components should have minimum touch target 44x44', async () => {
      const result = await generator.generateComponents(designSystem);

      for (const comp of result.components) {
        expect(comp.accessibility.minimumTouchTarget.width).toBeGreaterThanOrEqual(44);
        expect(comp.accessibility.minimumTouchTarget.height).toBeGreaterThanOrEqual(44);
      }
    });

    it('generated components should have accessibility labels present', async () => {
      const result = await generator.generateComponents(designSystem);

      for (const comp of result.components) {
        expect(comp.accessibility.label).toBeTruthy();
        expect(comp.accessibility.label.trim().length).toBeGreaterThan(0);
      }
    });

    it('generated components should support reduced motion', async () => {
      const result = await generator.generateComponents(designSystem);

      for (const comp of result.components) {
        expect(comp.accessibility.supportsReducedMotion).toBe(true);
      }
    });

    it('should report overallCompliant as true when all components pass', async () => {
      const result = await generator.generateComponents(designSystem);
      const report = result.accessibilityReport;

      // Default generated components should be compliant
      const errorIssues = report.issues.filter((i) => i.severity === 'error');
      if (errorIssues.length === 0) {
        expect(report.overallCompliant).toBe(true);
        expect(report.compliantComponents).toBe(report.totalComponents);
      }
    });

    it('should flag components with insufficient contrast ratio', () => {
      const components: UIComponentSpec[] = [
        {
          id: 'low-contrast',
          name: 'LowContrast',
          type: 'button',
          variant: 'primary',
          designSystemId: 'ds-1',
          styles: {},
          states: { default: {}, pressed: {}, disabled: {}, focused: {} },
          microInteractions: [],
          transitions: { enter: { type: 'fade', duration: 200, easing: 'ease' }, exit: { type: 'fade', duration: 150, easing: 'ease' } },
          accessibility: {
            level: 'AA',
            role: 'button',
            label: 'Test',
            traits: ['button'],
            minimumTouchTarget: { width: 44, height: 44 },
            contrastRatio: 2.0, // Below 4.5 minimum
            supportsVoiceOver: true,
            supportsDynamicType: true,
            supportsReducedMotion: true,
          },
          platformHints: { ios: { framework: 'SwiftUI', baseClass: 'Button' }, android: { framework: 'Compose', baseClass: 'Button' } },
          createdAt: new Date().toISOString(),
        },
      ];

      const report = generator.auditAccessibility(components, designSystem);

      expect(report.overallCompliant).toBe(false);
      const contrastIssue = report.issues.find((i) => i.wcagCriterion === '1.4.3 Contrast (Minimum)');
      expect(contrastIssue).toBeDefined();
      expect(contrastIssue!.severity).toBe('error');
    });

    it('should flag components with small touch targets', () => {
      const components: UIComponentSpec[] = [
        {
          id: 'small-target',
          name: 'SmallTarget',
          type: 'button',
          variant: 'primary',
          designSystemId: 'ds-1',
          styles: {},
          states: { default: {}, pressed: {}, disabled: {}, focused: {} },
          microInteractions: [],
          transitions: { enter: { type: 'fade', duration: 200, easing: 'ease' }, exit: { type: 'fade', duration: 150, easing: 'ease' } },
          accessibility: {
            level: 'AA',
            role: 'button',
            label: 'Test',
            traits: ['button'],
            minimumTouchTarget: { width: 30, height: 30 }, // Below 44x44 minimum
            contrastRatio: 5.0,
            supportsVoiceOver: true,
            supportsDynamicType: true,
            supportsReducedMotion: true,
          },
          platformHints: { ios: { framework: 'SwiftUI', baseClass: 'Button' }, android: { framework: 'Compose', baseClass: 'Button' } },
          createdAt: new Date().toISOString(),
        },
      ];

      const report = generator.auditAccessibility(components, designSystem);

      const targetIssue = report.issues.find((i) => i.wcagCriterion === '2.5.5 Target Size');
      expect(targetIssue).toBeDefined();
      expect(targetIssue!.severity).toBe('error');
    });

    it('should flag components missing accessibility labels', () => {
      const components: UIComponentSpec[] = [
        {
          id: 'no-label',
          name: 'NoLabel',
          type: 'button',
          variant: 'primary',
          designSystemId: 'ds-1',
          styles: {},
          states: { default: {}, pressed: {}, disabled: {}, focused: {} },
          microInteractions: [],
          transitions: { enter: { type: 'fade', duration: 200, easing: 'ease' }, exit: { type: 'fade', duration: 150, easing: 'ease' } },
          accessibility: {
            level: 'AA',
            role: 'button',
            label: '', // Empty label
            traits: ['button'],
            minimumTouchTarget: { width: 44, height: 44 },
            contrastRatio: 5.0,
            supportsVoiceOver: true,
            supportsDynamicType: true,
            supportsReducedMotion: true,
          },
          platformHints: { ios: { framework: 'SwiftUI', baseClass: 'Button' }, android: { framework: 'Compose', baseClass: 'Button' } },
          createdAt: new Date().toISOString(),
        },
      ];

      const report = generator.auditAccessibility(components, designSystem);

      const labelIssue = report.issues.find((i) => i.wcagCriterion === '1.1.1 Non-text Content');
      expect(labelIssue).toBeDefined();
      expect(labelIssue!.severity).toBe('error');
    });

    it('should warn about animations without reduced motion support', () => {
      const components: UIComponentSpec[] = [
        {
          id: 'no-reduced-motion',
          name: 'NoReducedMotion',
          type: 'button',
          variant: 'primary',
          designSystemId: 'ds-1',
          styles: {},
          states: { default: {}, pressed: {}, disabled: {}, focused: {} },
          microInteractions: [
            { trigger: 'press', animation: { type: 'scale', duration: 100, easing: 'ease', properties: {} } },
          ],
          transitions: { enter: { type: 'fade', duration: 200, easing: 'ease' }, exit: { type: 'fade', duration: 150, easing: 'ease' } },
          accessibility: {
            level: 'AA',
            role: 'button',
            label: 'Test',
            traits: ['button'],
            minimumTouchTarget: { width: 44, height: 44 },
            contrastRatio: 5.0,
            supportsVoiceOver: true,
            supportsDynamicType: true,
            supportsReducedMotion: false, // No reduced motion support
          },
          platformHints: { ios: { framework: 'SwiftUI', baseClass: 'Button' }, android: { framework: 'Compose', baseClass: 'Button' } },
          createdAt: new Date().toISOString(),
        },
      ];

      const report = generator.auditAccessibility(components, designSystem);

      const motionIssue = report.issues.find((i) => i.wcagCriterion === '2.3.3 Animation from Interactions');
      expect(motionIssue).toBeDefined();
      expect(motionIssue!.severity).toBe('warning');
    });

    it('should report overall compliant when all components pass — accessibility report generation', async () => {
      const result = await generator.generateComponents(designSystem);
      const report = result.accessibilityReport;

      // The default generated components should be compliant
      expect(report.totalComponents).toBe(10);
      expect(typeof report.overallCompliant).toBe('boolean');
      // Each issue should have componentId, componentName, issue, severity, wcagCriterion, remediation
      for (const issue of report.issues) {
        expect(issue.componentId).toBeTruthy();
        expect(issue.componentName).toBeTruthy();
        expect(issue.issue).toBeTruthy();
        expect(['error', 'warning', 'info']).toContain(issue.severity);
        expect(issue.wcagCriterion).toBeTruthy();
        expect(issue.remediation).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Transition and haptic feedback specs
  // -------------------------------------------------------------------------

  describe('transitions and haptic feedback', () => {
    it('each component should have enter and exit transitions', async () => {
      const result = await generator.generateComponents(designSystem);

      for (const comp of result.components) {
        expect(comp.transitions.enter).toBeDefined();
        expect(comp.transitions.enter.type).toBeTruthy();
        expect(comp.transitions.enter.duration).toBeGreaterThan(0);
        expect(comp.transitions.enter.easing).toBeTruthy();

        expect(comp.transitions.exit).toBeDefined();
        expect(comp.transitions.exit.type).toBeTruthy();
        expect(comp.transitions.exit.duration).toBeGreaterThan(0);
        expect(comp.transitions.exit.easing).toBeTruthy();
      }
    });

    it('button should have state change transition', async () => {
      const result = await generator.generateComponents(designSystem);
      const button = result.components.find((c) => c.type === 'button')!;

      expect(button.transitions.stateChange).toBeDefined();
      expect(button.transitions.stateChange!.type).toBeTruthy();
      expect(button.transitions.stateChange!.duration).toBeGreaterThan(0);
    });

    it('components with haptic feedback should specify type and intensity', async () => {
      const result = await generator.generateComponents(designSystem);

      const withHaptic = result.components.filter((c) =>
        c.microInteractions.some((i) => i.hapticFeedback),
      );

      expect(withHaptic.length).toBeGreaterThan(0);

      for (const comp of withHaptic) {
        for (const interaction of comp.microInteractions) {
          if (interaction.hapticFeedback) {
            expect(interaction.hapticFeedback.type).toBeTruthy();
            expect(interaction.hapticFeedback.intensity).toBeGreaterThan(0);
            expect(interaction.hapticFeedback.intensity).toBeLessThanOrEqual(1);
          }
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // No default platform widgets
  // -------------------------------------------------------------------------

  describe('platform hints — iOS (SwiftUI) and Android (Jetpack Compose)', () => {
    it('each component should have iOS platform hints with SwiftUI framework', async () => {
      const result = await generator.generateComponents(designSystem);

      for (const comp of result.components) {
        expect(comp.platformHints.ios).toBeDefined();
        expect(comp.platformHints.ios.framework).toBe('SwiftUI');
        expect(comp.platformHints.ios.baseClass).toBeTruthy();
      }
    });

    it('each component should have Android platform hints with Jetpack Compose framework', async () => {
      const result = await generator.generateComponents(designSystem);

      for (const comp of result.components) {
        expect(comp.platformHints.android).toBeDefined();
        expect(comp.platformHints.android.framework).toBe('Jetpack Compose');
        expect(comp.platformHints.android.baseClass).toBeTruthy();
      }
    });

    it('each component should have custom styles (not empty)', async () => {
      const result = await generator.generateComponents(designSystem);

      for (const comp of result.components) {
        expect(Object.keys(comp.styles).length).toBeGreaterThan(0);
      }
    });

    it('each component should reference the design system', async () => {
      const result = await generator.generateComponents(designSystem);

      for (const comp of result.components) {
        expect(comp.designSystemId).toBe(designSystem.id);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  describe('persistence to Zikaron via storeProcedural', () => {
    it('should store components via storeProcedural', async () => {
      await generator.generateComponents(designSystem);

      expect(mockZikaron.storeProcedural).toHaveBeenCalledTimes(1);
      const call = (mockZikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0]![0];

      expect(call.id).toContain('ui-components');
      expect(call.id).toContain('test-app');
      expect(call.content).toContain('test-app');
      expect(call.content).toContain('10');
      expect(call.tags).toContain('ui-components');
      expect(call.tags).toContain('wcag-aa');
      expect(call.tags).toContain('test-app');
      expect(call.sourceAgentId).toBe('zionx-app-factory');
      expect(call.tenantId).toBe('system');
      expect(call.layer).toBe('procedural');
    });

    it('should include steps for each generated component', async () => {
      await generator.generateComponents(designSystem);

      const call = (mockZikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0]![0];

      expect(call.steps).toHaveLength(10);
      for (const step of call.steps) {
        expect(step.order).toBeGreaterThan(0);
        expect(step.action).toBeTruthy();
        expect(step.description).toBeTruthy();
        expect(step.expectedOutcome).toBeTruthy();
      }
    });
  });
});

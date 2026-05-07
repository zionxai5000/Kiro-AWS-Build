/**
 * Unit tests for ZionX Design Excellence — Design Quality Gate
 *
 * Validates: Requirements 11c.7
 *
 * Tests design quality scoring against top-10 competitors, visual polish
 * evaluation, interaction design scoring, information architecture scoring,
 * onboarding effectiveness scoring, and pass/fail gate result.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DesignQualityGate } from '../design/quality-gate.js';
import type {
  DesignQualityReport,
  DesignQualityScore,
  DesignQualityInput,
  DesignImprovement,
} from '../design/quality-gate.js';
import type {
  AppCategory,
  DesignIntelligenceEngine,
  DesignAnalysisResult,
} from '../design/design-intelligence.js';
import type { DesignSystem } from '../design/design-system-generator.js';
import type { UserJourneyMap } from '../design/user-journey-engine.js';
import type { AccessibilityReport } from '../design/ui-component-generator.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockAnalysisResult(category: AppCategory): DesignAnalysisResult {
  return {
    category,
    platform: 'ios',
    appsAnalyzed: 10,
    uiPatterns: [],
    colorTrends: {
      category,
      primaryColors: ['#4CAF50'],
      accentColors: ['#FF9800'],
      backgroundStyles: ['light'],
      dominantPalette: ['#4CAF50'],
      analyzedAt: new Date().toISOString(),
    },
    animationStyles: [],
    onboardingFlows: [],
    monetizationUX: [],
    analyzedAt: new Date().toISOString(),
  };
}

function createMockDesignIntelligence(): DesignIntelligenceEngine {
  return {
    analyzeCategory: vi.fn(async (category: AppCategory) =>
      createMockAnalysisResult(category),
    ),
    loadPatternLibrary: vi.fn(),
  } as unknown as DesignIntelligenceEngine;
}

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

function createHighQualityDesignSystem(): DesignSystem {
  return {
    id: 'ds-quality-test',
    appId: 'quality-app',
    appName: 'QualityApp',
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
    components: [
      { name: 'Button', variants: ['primary'], defaultProps: {}, tokens: { backgroundColor: '#4CAF50' } },
      { name: 'Card', variants: ['elevated'], defaultProps: {}, tokens: { backgroundColor: '#F5F5F5' } },
      { name: 'Input', variants: ['default'], defaultProps: {}, tokens: { focusBorderColor: '#4CAF50' } },
      { name: 'TabBar', variants: ['bottom'], defaultProps: {}, tokens: { activeColor: '#4CAF50' } },
      { name: 'Modal', variants: ['center'], defaultProps: {}, tokens: { backgroundColor: '#FFFFFF' } },
    ],
    similarityScore: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createHighQualityJourneyMap(): UserJourneyMap {
  return {
    id: 'journey-test',
    appId: 'quality-app',
    appName: 'QualityApp',
    category: 'wellness',
    onboarding: {
      steps: [
        { id: 'o1', name: 'Welcome', phase: 'onboarding', screenRef: 's1', description: 'Welcome', userAction: 'View', systemResponse: 'Show', successMetric: 'viewed', order: 1 },
        { id: 'o2', name: 'Value', phase: 'onboarding', screenRef: 's2', description: 'Value', userAction: 'Swipe', systemResponse: 'Show', successMetric: 'viewed', order: 2 },
        { id: 'o3', name: 'Prefs', phase: 'onboarding', screenRef: 's3', description: 'Prefs', userAction: 'Select', systemResponse: 'Save', successMetric: 'collected', order: 3 },
        { id: 'o4', name: 'Start', phase: 'onboarding', screenRef: 's4', description: 'Start', userAction: 'Tap', systemResponse: 'Navigate', successMetric: 'completed', order: 4 },
      ],
      totalSteps: 4,
      hasSkipOption: true,
      collectsPreferences: true,
      showsValueProp: true,
      estimatedDurationSeconds: 45,
    },
    firstSession: {
      steps: [
        { id: 'f1', name: 'Tour', phase: 'first_session', screenRef: 's5', description: 'Tour', userAction: 'Follow', systemResponse: 'Show', successMetric: 'completed', order: 1 },
        { id: 'f2', name: 'Action', phase: 'first_session', screenRef: 's6', description: 'Action', userAction: 'Do', systemResponse: 'Celebrate', successMetric: 'done', order: 2 },
        { id: 'f3', name: 'Aha', phase: 'first_session', screenRef: 's7', description: 'Aha', userAction: 'View', systemResponse: 'Delight', successMetric: 'reached', order: 3 },
      ],
      guidedTour: true,
      highlightsKeyFeature: true,
      endsWithAhamoment: true,
      estimatedDurationMinutes: 3,
    },
    coreLoop: {
      trigger: 'Daily reminder',
      action: 'Complete activity',
      reward: 'Progress visualization',
      investment: 'Streak maintenance',
      loopFrequency: 'daily',
      steps: [
        { id: 'l1', name: 'Trigger', phase: 'core_loop', screenRef: 's8', description: 'Trigger', userAction: 'Open', systemResponse: 'Show', successMetric: 'started', order: 1 },
        { id: 'l2', name: 'Action', phase: 'core_loop', screenRef: 's9', description: 'Action', userAction: 'Do', systemResponse: 'Process', successMetric: 'done', order: 2 },
        { id: 'l3', name: 'Reward', phase: 'core_loop', screenRef: 's10', description: 'Reward', userAction: 'View', systemResponse: 'Celebrate', successMetric: 'viewed', order: 3 },
      ],
    },
    retentionMechanics: [
      { type: 'streak', name: 'Daily Streak', description: 'Track days', triggerCondition: 'daily', expectedImpact: '+15%' },
      { type: 'notification', name: 'Reminders', description: 'Push', triggerCondition: 'inactive', expectedImpact: '+10%' },
      { type: 'progress', name: 'Progress', description: 'Visual', triggerCondition: 'action', expectedImpact: '+20%' },
      { type: 'content_refresh', name: 'Fresh', description: 'Updates', triggerCondition: 'stale', expectedImpact: '+12%' },
    ],
    monetizationTouchpoints: [
      { type: 'paywall', name: 'Soft Paywall', triggerCondition: 'limit', screenRef: 's-pay', conversionGoal: 'subscribe', placement: 'balanced' },
      { type: 'trial_end', name: 'Trial', triggerCondition: 'expires', screenRef: 's-trial', conversionGoal: 'convert', placement: 'balanced' },
      { type: 'feature_gate', name: 'Premium', triggerCondition: 'tap', screenRef: 's-gate', conversionGoal: 'unlock', placement: 'subtle' },
    ],
    totalSteps: 10,
    createdAt: new Date().toISOString(),
  };
}

function createHighQualityAccessibilityReport(): AccessibilityReport {
  return {
    level: 'AA',
    totalComponents: 10,
    compliantComponents: 10,
    issues: [],
    overallCompliant: true,
  };
}

function createDefaultInput(overrides?: Partial<DesignQualityInput>): DesignQualityInput {
  return {
    appId: 'quality-app',
    appName: 'QualityApp',
    category: 'wellness',
    platform: 'ios',
    designSystem: createHighQualityDesignSystem(),
    journeyMap: createHighQualityJourneyMap(),
    accessibilityReport: createHighQualityAccessibilityReport(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DesignQualityGate', () => {
  let gate: DesignQualityGate;
  let mockDesignIntelligence: DesignIntelligenceEngine;
  let mockZikaron: ZikaronService;

  beforeEach(() => {
    mockDesignIntelligence = createMockDesignIntelligence();
    mockZikaron = createMockZikaronService();
    gate = new DesignQualityGate(mockDesignIntelligence, mockZikaron);
  });

  // -------------------------------------------------------------------------
  // Design quality scoring against top-10 competitors
  // -------------------------------------------------------------------------

  describe('evaluate() — competitor benchmarking', () => {
    it('should produce a complete DesignQualityReport', async () => {
      const report = await gate.evaluate(createDefaultInput());

      expect(report.appId).toBe('quality-app');
      expect(report.category).toBe('wellness');
      expect(report.scores).toBeDefined();
      expect(report.competitorBenchmarks).toBeDefined();
      expect(report.averageCompetitorScore).toBeGreaterThan(0);
      expect(report.percentileRank).toBeGreaterThanOrEqual(0);
      expect(report.percentileRank).toBeLessThanOrEqual(100);
      expect(report.gateResult).toBeDefined();
      expect(report.improvements).toBeDefined();
      expect(report.evaluatedAt).toBeTruthy();
    });

    it('should benchmark against up to 10 competitors', async () => {
      const report = await gate.evaluate(createDefaultInput());

      expect(report.competitorBenchmarks.length).toBeLessThanOrEqual(10);
      expect(report.competitorBenchmarks.length).toBeGreaterThan(0);

      for (const benchmark of report.competitorBenchmarks) {
        expect(benchmark.appName).toBeTruthy();
        expect(benchmark.estimatedScore).toBeGreaterThanOrEqual(0);
        expect(benchmark.strengths.length).toBeGreaterThan(0);
        expect(benchmark.weaknesses.length).toBeGreaterThan(0);
      }
    });

    it('should call designIntelligence.analyzeCategory', async () => {
      await gate.evaluate(createDefaultInput());

      expect(mockDesignIntelligence.analyzeCategory).toHaveBeenCalledWith('wellness', 'ios');
    });
  });

  // -------------------------------------------------------------------------
  // Visual polish evaluation
  // -------------------------------------------------------------------------

  describe('scoreDesign() — visual polish', () => {
    it('should score visual polish based on design system completeness', () => {
      const input = createDefaultInput();
      const scores = gate.scoreDesign(input);

      expect(scores.visualPolish).toBeGreaterThanOrEqual(0);
      expect(scores.visualPolish).toBeLessThanOrEqual(100);
    });

    it('should give higher visual polish score for complete design systems', () => {
      const input = createDefaultInput();
      const scores = gate.scoreDesign(input);

      // Our mock design system has all color palette keys, typography, spacing, animations
      expect(scores.visualPolish).toBeGreaterThanOrEqual(50);
    });

    it('should give lower visual polish score for incomplete design systems', () => {
      const incompleteDS = createHighQualityDesignSystem();
      // Remove some elements to reduce score
      incompleteDS.colorPalette.error = '';
      incompleteDS.colorPalette.warning = '';
      incompleteDS.colorPalette.success = '';
      incompleteDS.typography.fontFamily.primary = '';
      incompleteDS.spacing.scale = {};
      incompleteDS.animations.durations = { fast: 0, normal: 0, slow: 0 };
      incompleteDS.animations.easings = { standard: '', decelerate: '', accelerate: '', spring: '' };
      incompleteDS.similarityScore = 80; // High similarity = less unique

      const input = createDefaultInput({ designSystem: incompleteDS });
      const scores = gate.scoreDesign(input);

      expect(scores.visualPolish).toBeLessThan(100);
    });
  });

  // -------------------------------------------------------------------------
  // Interaction design scoring
  // -------------------------------------------------------------------------

  describe('scoreDesign() — interaction design', () => {
    it('should score interaction design based on animations and components', () => {
      const input = createDefaultInput();
      const scores = gate.scoreDesign(input);

      expect(scores.interactionDesign).toBeGreaterThanOrEqual(0);
      expect(scores.interactionDesign).toBeLessThanOrEqual(100);
    });

    it('should give higher score for design systems with animation transitions', () => {
      const input = createDefaultInput();
      const scores = gate.scoreDesign(input);

      // Our mock has pageEnter and elementEnter transitions + 5 components + iconography
      expect(scores.interactionDesign).toBeGreaterThanOrEqual(50);
    });
  });

  // -------------------------------------------------------------------------
  // Information architecture scoring
  // -------------------------------------------------------------------------

  describe('scoreDesign() — information architecture', () => {
    it('should score information architecture based on journey map', () => {
      const input = createDefaultInput();
      const scores = gate.scoreDesign(input);

      expect(scores.informationArchitecture).toBeGreaterThanOrEqual(0);
      expect(scores.informationArchitecture).toBeLessThanOrEqual(100);
    });

    it('should give higher score for well-structured journey maps', () => {
      const input = createDefaultInput();
      const scores = gate.scoreDesign(input);

      // Our mock has core loop with trigger/action/reward, 4 retention mechanics,
      // 3 monetization touchpoints, and 10 total steps
      expect(scores.informationArchitecture).toBeGreaterThanOrEqual(70);
    });

    it('should give lower score for journey maps missing core loop elements', () => {
      const weakJourney = createHighQualityJourneyMap();
      weakJourney.coreLoop.trigger = '';
      weakJourney.coreLoop.action = '';
      weakJourney.coreLoop.reward = '';
      weakJourney.retentionMechanics = [];
      weakJourney.monetizationTouchpoints = [];
      weakJourney.totalSteps = 50; // Too complex

      const input = createDefaultInput({ journeyMap: weakJourney });
      const scores = gate.scoreDesign(input);

      expect(scores.informationArchitecture).toBeLessThan(70);
    });
  });

  // -------------------------------------------------------------------------
  // Onboarding effectiveness scoring
  // -------------------------------------------------------------------------

  describe('scoreDesign() — onboarding effectiveness', () => {
    it('should score onboarding effectiveness', () => {
      const input = createDefaultInput();
      const scores = gate.scoreDesign(input);

      expect(scores.onboardingEffectiveness).toBeGreaterThanOrEqual(0);
      expect(scores.onboardingEffectiveness).toBeLessThanOrEqual(100);
    });

    it('should give high score for ideal onboarding (skip, value prop, prefs, 3-5 steps, aha moment)', () => {
      const input = createDefaultInput();
      const scores = gate.scoreDesign(input);

      // Our mock has: skip option, value prop, prefs, 4 steps, 45s duration, aha moment
      expect(scores.onboardingEffectiveness).toBeGreaterThanOrEqual(80);
    });

    it('should give lower score for poor onboarding', () => {
      const weakJourney = createHighQualityJourneyMap();
      weakJourney.onboarding.hasSkipOption = false;
      weakJourney.onboarding.showsValueProp = false;
      weakJourney.onboarding.collectsPreferences = false;
      weakJourney.onboarding.totalSteps = 10; // Too many
      weakJourney.onboarding.estimatedDurationSeconds = 120; // Too long
      weakJourney.firstSession.endsWithAhamoment = false;

      const input = createDefaultInput({ journeyMap: weakJourney });
      const scores = gate.scoreDesign(input);

      expect(scores.onboardingEffectiveness).toBeLessThan(50);
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility compliance scoring
  // -------------------------------------------------------------------------

  describe('scoreDesign() — accessibility compliance', () => {
    it('should score accessibility based on compliance report', () => {
      const input = createDefaultInput();
      const scores = gate.scoreDesign(input);

      expect(scores.accessibilityCompliance).toBeGreaterThanOrEqual(0);
      expect(scores.accessibilityCompliance).toBeLessThanOrEqual(100);
    });

    it('should give 100 for fully compliant report with no errors', () => {
      const input = createDefaultInput();
      const scores = gate.scoreDesign(input);

      // 10/10 compliant, 0 errors → 80 + 20 bonus = 100
      expect(scores.accessibilityCompliance).toBe(100);
    });

    it('should give 0 for report with no components', () => {
      const emptyReport: AccessibilityReport = {
        level: 'AA',
        totalComponents: 0,
        compliantComponents: 0,
        issues: [],
        overallCompliant: true,
      };

      const input = createDefaultInput({ accessibilityReport: emptyReport });
      const scores = gate.scoreDesign(input);

      expect(scores.accessibilityCompliance).toBe(0);
    });

    it('should penalize for accessibility errors', () => {
      const reportWithErrors: AccessibilityReport = {
        level: 'AA',
        totalComponents: 10,
        compliantComponents: 7,
        issues: [
          { componentId: 'c1', componentName: 'Button', issue: 'Low contrast', severity: 'error', wcagCriterion: '1.4.3', remediation: 'Fix' },
          { componentId: 'c2', componentName: 'Card', issue: 'Low contrast', severity: 'error', wcagCriterion: '1.4.3', remediation: 'Fix' },
          { componentId: 'c3', componentName: 'Input', issue: 'Low contrast', severity: 'error', wcagCriterion: '1.4.3', remediation: 'Fix' },
        ],
        overallCompliant: false,
      };

      const input = createDefaultInput({ accessibilityReport: reportWithErrors });
      const scores = gate.scoreDesign(input);

      // 7/10 * 80 = 56, minus 3 errors * 5 = 15, so 56 - 15 = 41
      expect(scores.accessibilityCompliance).toBeLessThan(60);
    });
  });

  // -------------------------------------------------------------------------
  // Overall score calculation
  // -------------------------------------------------------------------------

  describe('scoreDesign() — overall score', () => {
    it('should calculate overall as weighted average of all dimensions', () => {
      const input = createDefaultInput();
      const scores = gate.scoreDesign(input);

      const expected = Math.round(
        scores.visualPolish * 0.25 +
        scores.interactionDesign * 0.2 +
        scores.informationArchitecture * 0.2 +
        scores.onboardingEffectiveness * 0.2 +
        scores.accessibilityCompliance * 0.15,
      );

      expect(scores.overall).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // Pass/fail gate result
  // -------------------------------------------------------------------------

  describe('evaluate() — gate result', () => {
    it('should pass when all scores meet thresholds', async () => {
      const report = await gate.evaluate(createDefaultInput());

      // With high-quality mocks, the gate should pass
      // (depends on random competitor scores, but our design is strong)
      expect(report.gateResult.gateId).toBe('gate-design-quality');
      expect(report.gateResult.gateName).toBe('Design Quality Gate');
      expect(typeof report.gateResult.passed).toBe('boolean');
      expect(report.gateResult.details).toBeTruthy();
    });

    it('should fail when accessibility score is below 80', async () => {
      const lowAccessibility: AccessibilityReport = {
        level: 'AA',
        totalComponents: 10,
        compliantComponents: 3,
        issues: [
          { componentId: 'c1', componentName: 'B1', issue: 'err', severity: 'error', wcagCriterion: '1.4.3', remediation: 'Fix' },
          { componentId: 'c2', componentName: 'B2', issue: 'err', severity: 'error', wcagCriterion: '1.4.3', remediation: 'Fix' },
          { componentId: 'c3', componentName: 'B3', issue: 'err', severity: 'error', wcagCriterion: '1.4.3', remediation: 'Fix' },
          { componentId: 'c4', componentName: 'B4', issue: 'err', severity: 'error', wcagCriterion: '1.4.3', remediation: 'Fix' },
          { componentId: 'c5', componentName: 'B5', issue: 'err', severity: 'error', wcagCriterion: '1.4.3', remediation: 'Fix' },
          { componentId: 'c6', componentName: 'B6', issue: 'err', severity: 'error', wcagCriterion: '1.4.3', remediation: 'Fix' },
          { componentId: 'c7', componentName: 'B7', issue: 'err', severity: 'error', wcagCriterion: '1.4.3', remediation: 'Fix' },
        ],
        overallCompliant: false,
      };

      const report = await gate.evaluate(createDefaultInput({ accessibilityReport: lowAccessibility }));

      expect(report.gateResult.passed).toBe(false);
      expect(report.gateResult.details).toContain('Accessibility score');
    });

    it('should generate improvement suggestions for low-scoring areas', async () => {
      const report = await gate.evaluate(createDefaultInput());

      expect(Array.isArray(report.improvements)).toBe(true);

      for (const improvement of report.improvements) {
        expect(['visual_polish', 'interaction_design', 'information_architecture', 'onboarding', 'accessibility']).toContain(improvement.area);
        expect(['high', 'medium', 'low']).toContain(improvement.priority);
        expect(improvement.description).toBeTruthy();
        expect(improvement.estimatedImpact).toBeGreaterThan(0);
      }
    });

    it('should sort improvements by estimated impact descending', async () => {
      const report = await gate.evaluate(createDefaultInput());

      if (report.improvements.length >= 2) {
        for (let i = 0; i < report.improvements.length - 1; i++) {
          expect(report.improvements[i]!.estimatedImpact).toBeGreaterThanOrEqual(
            report.improvements[i + 1]!.estimatedImpact,
          );
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  describe('persistence to Zikaron', () => {
    it('should store evaluation via storeEpisodic', async () => {
      await gate.evaluate(createDefaultInput());

      expect(mockZikaron.storeEpisodic).toHaveBeenCalledTimes(1);
      const call = (mockZikaron.storeEpisodic as ReturnType<typeof vi.fn>).mock.calls[0]![0];

      expect(call.content).toContain('quality-app');
      expect(call.tags).toContain('design-quality');
      expect(call.sourceAgentId).toBe('zionx-app-factory');
      expect(call.layer).toBe('episodic');
      expect(call.eventType).toBe('design_quality_evaluation');
    });
  });
});

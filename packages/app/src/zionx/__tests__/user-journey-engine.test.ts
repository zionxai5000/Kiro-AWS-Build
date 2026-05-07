/**
 * Unit tests for ZionX Design Excellence — User Journey Engine
 *
 * Validates: Requirements 11c.4
 *
 * Tests onboarding flow generation, first-session experience, core loop
 * definition, retention mechanics, monetization touchpoint placement,
 * and structured journey map output.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserJourneyEngine } from '../design/user-journey-engine.js';
import type {
  UserJourneyMap,
  OnboardingSpec,
  FirstSessionSpec,
  CoreLoopSpec,
  RetentionMechanic,
  MonetizationTouchpoint,
  LLMDriver,
} from '../design/user-journey-engine.js';
import type { AppCategory } from '../design/design-intelligence.js';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockLLMDriver(): LLMDriver {
  return {
    execute: vi.fn(async () => ({
      success: true,
      data: 'Generated content',
      metadata: {},
    })),
  } as unknown as LLMDriver;
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserJourneyEngine', () => {
  let engine: UserJourneyEngine;
  let mockLLM: LLMDriver;
  let mockZikaron: ZikaronService;

  const defaultFeatures = ['feature-a', 'feature-b', 'feature-c'];

  beforeEach(() => {
    mockLLM = createMockLLMDriver();
    mockZikaron = createMockZikaronService();
    engine = new UserJourneyEngine(mockLLM, mockZikaron);
  });

  // -------------------------------------------------------------------------
  // generateJourneyMap() — full journey map
  // -------------------------------------------------------------------------

  describe('generateJourneyMap()', () => {
    it('should produce a complete UserJourneyMap with all sections', async () => {
      const map = await engine.generateJourneyMap('app-1', 'TestApp', 'wellness', defaultFeatures);

      expect(map.id).toContain('journey-app-1');
      expect(map.appId).toBe('app-1');
      expect(map.appName).toBe('TestApp');
      expect(map.category).toBe('wellness');
      expect(map.onboarding).toBeDefined();
      expect(map.firstSession).toBeDefined();
      expect(map.coreLoop).toBeDefined();
      expect(map.retentionMechanics).toBeDefined();
      expect(map.monetizationTouchpoints).toBeDefined();
      expect(map.totalSteps).toBeGreaterThan(0);
      expect(map.createdAt).toBeTruthy();
    });

    it('should calculate totalSteps as sum of onboarding + firstSession + coreLoop steps', async () => {
      const map = await engine.generateJourneyMap('app-2', 'CalcApp', 'productivity', defaultFeatures);

      const expected =
        map.onboarding.steps.length +
        map.firstSession.steps.length +
        map.coreLoop.steps.length;

      expect(map.totalSteps).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // Onboarding flow generation
  // -------------------------------------------------------------------------

  describe('designOnboarding()', () => {
    it('should generate an onboarding flow with 3-5 steps', async () => {
      const onboarding = await engine.designOnboarding('TestApp', 'wellness', defaultFeatures);

      expect(onboarding.totalSteps).toBeGreaterThanOrEqual(3);
      expect(onboarding.totalSteps).toBeLessThanOrEqual(5);
      expect(onboarding.steps).toHaveLength(onboarding.totalSteps);
    });

    it('should include skip option', async () => {
      const onboarding = await engine.designOnboarding('TestApp', 'productivity', defaultFeatures);
      expect(onboarding.hasSkipOption).toBe(true);
    });

    it('should collect user preferences', async () => {
      const onboarding = await engine.designOnboarding('TestApp', 'finance', defaultFeatures);
      expect(onboarding.collectsPreferences).toBe(true);
    });

    it('should show value proposition', async () => {
      const onboarding = await engine.designOnboarding('TestApp', 'utility', defaultFeatures);
      expect(onboarding.showsValueProp).toBe(true);
    });

    it('should have reasonable estimated duration', async () => {
      const onboarding = await engine.designOnboarding('TestApp', 'gaming', defaultFeatures);
      expect(onboarding.estimatedDurationSeconds).toBeGreaterThan(0);
      expect(onboarding.estimatedDurationSeconds).toBeLessThanOrEqual(120);
    });

    it('each step should have all required fields', async () => {
      const onboarding = await engine.designOnboarding('TestApp', 'wellness', defaultFeatures);

      for (const step of onboarding.steps) {
        expect(step.id).toBeTruthy();
        expect(step.name).toBeTruthy();
        expect(step.phase).toBe('onboarding');
        expect(step.screenRef).toBeTruthy();
        expect(step.description).toBeTruthy();
        expect(step.userAction).toBeTruthy();
        expect(step.systemResponse).toBeTruthy();
        expect(step.successMetric).toBeTruthy();
        expect(step.order).toBeGreaterThan(0);
      }
    });

    it('should call LLM driver for onboarding generation', async () => {
      await engine.designOnboarding('TestApp', 'wellness', defaultFeatures);
      expect(mockLLM.execute).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // First-session experience
  // -------------------------------------------------------------------------

  describe('designFirstSession()', () => {
    it('should generate a first-session experience with guided tour', async () => {
      const session = await engine.designFirstSession('TestApp', 'wellness', defaultFeatures);

      expect(session.guidedTour).toBe(true);
      expect(session.highlightsKeyFeature).toBe(true);
    });

    it('should end with an aha moment', async () => {
      const session = await engine.designFirstSession('TestApp', 'productivity', defaultFeatures);
      expect(session.endsWithAhamoment).toBe(true);
    });

    it('should have reasonable estimated duration', async () => {
      const session = await engine.designFirstSession('TestApp', 'finance', defaultFeatures);
      expect(session.estimatedDurationMinutes).toBeGreaterThan(0);
    });

    it('should include steps with first_session phase', async () => {
      const session = await engine.designFirstSession('TestApp', 'gaming', defaultFeatures);

      expect(session.steps.length).toBeGreaterThan(0);
      for (const step of session.steps) {
        expect(step.phase).toBe('first_session');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Core loop definition
  // -------------------------------------------------------------------------

  describe('defineCoreLoop()', () => {
    it('should define a core loop with trigger, action, reward, investment', () => {
      const loop = engine.defineCoreLoop('TestApp', 'wellness', defaultFeatures);

      expect(loop.trigger).toBeTruthy();
      expect(loop.action).toBeTruthy();
      expect(loop.reward).toBeTruthy();
      expect(loop.investment).toBeTruthy();
    });

    it('should set loop frequency based on category', () => {
      const wellnessLoop = engine.defineCoreLoop('App', 'wellness', defaultFeatures);
      expect(wellnessLoop.loopFrequency).toBe('daily');

      const utilityLoop = engine.defineCoreLoop('App', 'utility', defaultFeatures);
      expect(utilityLoop.loopFrequency).toBe('on_demand');
    });

    it('should include core_loop phase steps', () => {
      const loop = engine.defineCoreLoop('TestApp', 'productivity', defaultFeatures);

      expect(loop.steps.length).toBeGreaterThan(0);
      for (const step of loop.steps) {
        expect(step.phase).toBe('core_loop');
      }
    });

    it.each(['wellness', 'productivity', 'finance', 'utility', 'gaming'] as AppCategory[])(
      'should produce a valid core loop for %s category',
      (category) => {
        const loop = engine.defineCoreLoop('App', category, defaultFeatures);
        expect(loop.trigger).toBeTruthy();
        expect(loop.action).toBeTruthy();
        expect(loop.reward).toBeTruthy();
        expect(loop.steps.length).toBeGreaterThan(0);
      },
    );
  });

  // -------------------------------------------------------------------------
  // Retention mechanics
  // -------------------------------------------------------------------------

  describe('defineRetentionMechanics()', () => {
    it('should return at least 2 retention mechanics', () => {
      const mechanics = engine.defineRetentionMechanics('wellness');
      expect(mechanics.length).toBeGreaterThanOrEqual(2);
    });

    it('should include streak and notification mechanics', () => {
      const mechanics = engine.defineRetentionMechanics('productivity');
      const types = mechanics.map((m) => m.type);

      expect(types).toContain('streak');
      expect(types).toContain('notification');
    });

    it('each mechanic should have all required fields', () => {
      const mechanics = engine.defineRetentionMechanics('finance');

      for (const mechanic of mechanics) {
        expect(mechanic.type).toBeTruthy();
        expect(mechanic.name).toBeTruthy();
        expect(mechanic.description).toBeTruthy();
        expect(mechanic.triggerCondition).toBeTruthy();
        expect(mechanic.expectedImpact).toBeTruthy();
      }
    });

    it('should include progress tracking mechanic', () => {
      const mechanics = engine.defineRetentionMechanics('gaming');
      const types = mechanics.map((m) => m.type);
      expect(types).toContain('progress');
    });

    it('should include content_refresh mechanic', () => {
      const mechanics = engine.defineRetentionMechanics('wellness');
      const types = mechanics.map((m) => m.type);
      expect(types).toContain('content_refresh');
    });
  });

  // -------------------------------------------------------------------------
  // Monetization touchpoint placement
  // -------------------------------------------------------------------------

  describe('defineMonetizationTouchpoints()', () => {
    it('should return at least 2 monetization touchpoints', () => {
      const touchpoints = engine.defineMonetizationTouchpoints('wellness');
      expect(touchpoints.length).toBeGreaterThanOrEqual(2);
    });

    it('should include paywall and feature gate touchpoints', () => {
      const touchpoints = engine.defineMonetizationTouchpoints('productivity');
      const types = touchpoints.map((t) => t.type);

      expect(types).toContain('paywall');
      expect(types).toContain('feature_gate');
    });

    it('each touchpoint should have all required fields', () => {
      const touchpoints = engine.defineMonetizationTouchpoints('finance');

      for (const tp of touchpoints) {
        expect(tp.type).toBeTruthy();
        expect(tp.name).toBeTruthy();
        expect(tp.triggerCondition).toBeTruthy();
        expect(tp.screenRef).toBeTruthy();
        expect(tp.conversionGoal).toBeTruthy();
        expect(['aggressive', 'balanced', 'subtle']).toContain(tp.placement);
      }
    });

    it('should include trial_end and upsell touchpoints', () => {
      const touchpoints = engine.defineMonetizationTouchpoints('gaming');
      const types = touchpoints.map((t) => t.type);

      expect(types).toContain('trial_end');
      expect(types).toContain('upsell');
    });
  });

  // -------------------------------------------------------------------------
  // Output as structured journey map
  // -------------------------------------------------------------------------

  describe('structured journey map output', () => {
    it('should output a journey map with all phases connected', async () => {
      const map = await engine.generateJourneyMap('app-3', 'StructApp', 'wellness', defaultFeatures);

      // Verify all phases are present
      const allSteps = [
        ...map.onboarding.steps,
        ...map.firstSession.steps,
        ...map.coreLoop.steps,
      ];

      const phases = new Set(allSteps.map((s) => s.phase));
      expect(phases.has('onboarding')).toBe(true);
      expect(phases.has('first_session')).toBe(true);
      expect(phases.has('core_loop')).toBe(true);
    });

    it('should store journey map in Zikaron', async () => {
      await engine.generateJourneyMap('app-4', 'PersistApp', 'productivity', defaultFeatures);

      expect(mockZikaron.storeProcedural).toHaveBeenCalledTimes(1);
      const call = (mockZikaron.storeProcedural as ReturnType<typeof vi.fn>).mock.calls[0]![0];

      expect(call.content).toContain('PersistApp');
      expect(call.tags).toContain('user-journey');
      expect(call.tags).toContain('productivity');
      expect(call.sourceAgentId).toBe('zionx-app-factory');
      expect(call.layer).toBe('procedural');
      expect(call.steps.length).toBe(5);
    });
  });
});

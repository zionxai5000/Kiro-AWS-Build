/**
 * ZionX Design Excellence — User Journey Engine
 *
 * Defines onboarding flow, first-session experience, core loop, retention
 * mechanics, and monetization touchpoints for each app before code generation.
 * Outputs a structured journey map consumed by the build pipeline.
 *
 * Requirements: 11c.4
 */

import type { DriverResult } from '@seraphim/core';
import type { ZikaronService } from '@seraphim/core/interfaces/zikaron-service.js';
import type { AppCategory } from './design-intelligence.js';

// ---------------------------------------------------------------------------
// Driver interfaces
// ---------------------------------------------------------------------------

export interface LLMDriver {
  execute(operation: { type: string; params: Record<string, unknown> }): Promise<DriverResult>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JourneyStep {
  id: string;
  name: string;
  phase: 'onboarding' | 'first_session' | 'core_loop' | 'retention' | 'monetization';
  screenRef: string;
  description: string;
  userAction: string;
  systemResponse: string;
  successMetric: string;
  order: number;
}

export interface OnboardingSpec {
  steps: JourneyStep[];
  totalSteps: number;
  hasSkipOption: boolean;
  collectsPreferences: boolean;
  showsValueProp: boolean;
  estimatedDurationSeconds: number;
}

export interface FirstSessionSpec {
  steps: JourneyStep[];
  guidedTour: boolean;
  highlightsKeyFeature: boolean;
  endsWithAhamoment: boolean;
  estimatedDurationMinutes: number;
}

export interface CoreLoopSpec {
  trigger: string;
  action: string;
  reward: string;
  investment: string;
  loopFrequency: 'daily' | 'weekly' | 'on_demand';
  steps: JourneyStep[];
}

export interface RetentionMechanic {
  type: 'streak' | 'notification' | 'progress' | 'social' | 'content_refresh' | 'challenge';
  name: string;
  description: string;
  triggerCondition: string;
  expectedImpact: string;
}

export interface MonetizationTouchpoint {
  type: 'paywall' | 'upsell' | 'feature_gate' | 'trial_end' | 'usage_limit' | 'premium_content';
  name: string;
  triggerCondition: string;
  screenRef: string;
  conversionGoal: string;
  placement: 'aggressive' | 'balanced' | 'subtle';
}

export interface UserJourneyMap {
  id: string;
  appId: string;
  appName: string;
  category: AppCategory;
  onboarding: OnboardingSpec;
  firstSession: FirstSessionSpec;
  coreLoop: CoreLoopSpec;
  retentionMechanics: RetentionMechanic[];
  monetizationTouchpoints: MonetizationTouchpoint[];
  totalSteps: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// User Journey Engine
// ---------------------------------------------------------------------------

export class UserJourneyEngine {
  constructor(
    private readonly llmDriver: LLMDriver,
    private readonly zikaronService: ZikaronService,
  ) {}

  /**
   * Generate a complete user journey map for an app.
   */
  async generateJourneyMap(
    appId: string,
    appName: string,
    category: AppCategory,
    features: string[],
  ): Promise<UserJourneyMap> {
    // 1. Generate onboarding flow
    const onboarding = await this.designOnboarding(appName, category, features);

    // 2. Design first-session experience
    const firstSession = await this.designFirstSession(appName, category, features);

    // 3. Define core loop
    const coreLoop = this.defineCoreLoop(appName, category, features);

    // 4. Define retention mechanics
    const retentionMechanics = this.defineRetentionMechanics(category);

    // 5. Define monetization touchpoints
    const monetizationTouchpoints = this.defineMonetizationTouchpoints(category);

    const totalSteps =
      onboarding.steps.length +
      firstSession.steps.length +
      coreLoop.steps.length;

    const journeyMap: UserJourneyMap = {
      id: `journey-${appId}-${Date.now()}`,
      appId,
      appName,
      category,
      onboarding,
      firstSession,
      coreLoop,
      retentionMechanics,
      monetizationTouchpoints,
      totalSteps,
      createdAt: new Date().toISOString(),
    };

    // 6. Store in Zikaron
    await this.storeJourneyMap(journeyMap);

    return journeyMap;
  }

  /**
   * Design the onboarding flow.
   */
  async designOnboarding(
    appName: string,
    category: AppCategory,
    features: string[],
  ): Promise<OnboardingSpec> {
    const prompt = [
      `Design a 3-5 step onboarding flow for "${appName}" (${category} app).`,
      `Key features: ${features.join(', ')}`,
      'Include: value proposition, preference collection, and a clear CTA.',
    ].join('\n');

    await this.llmDriver.execute({
      type: 'generate',
      params: { prompt, maxTokens: 1500, temperature: 0.5, taskType: 'creative' },
    });

    const steps: JourneyStep[] = [
      {
        id: 'onboard-1', name: 'Welcome', phase: 'onboarding', screenRef: 'screen-onboarding-welcome',
        description: `Welcome to ${appName}`, userAction: 'View welcome screen', systemResponse: 'Show app value proposition with animation',
        successMetric: 'user_viewed_welcome', order: 1,
      },
      {
        id: 'onboard-2', name: 'Value Proposition', phase: 'onboarding', screenRef: 'screen-onboarding-value',
        description: 'Show key benefits', userAction: 'Swipe through benefits', systemResponse: 'Display 3 key benefits with illustrations',
        successMetric: 'user_viewed_benefits', order: 2,
      },
      {
        id: 'onboard-3', name: 'Preferences', phase: 'onboarding', screenRef: 'screen-onboarding-prefs',
        description: 'Collect user preferences', userAction: 'Select preferences', systemResponse: 'Personalize experience based on selections',
        successMetric: 'preferences_collected', order: 3,
      },
      {
        id: 'onboard-4', name: 'Get Started', phase: 'onboarding', screenRef: 'screen-onboarding-cta',
        description: 'Final CTA to start using the app', userAction: 'Tap "Get Started"', systemResponse: 'Navigate to home screen',
        successMetric: 'onboarding_completed', order: 4,
      },
    ];

    return {
      steps,
      totalSteps: steps.length,
      hasSkipOption: true,
      collectsPreferences: true,
      showsValueProp: true,
      estimatedDurationSeconds: 45,
    };
  }

  /**
   * Design the first-session experience.
   */
  async designFirstSession(
    appName: string,
    category: AppCategory,
    features: string[],
  ): Promise<FirstSessionSpec> {
    const steps: JourneyStep[] = [
      {
        id: 'first-1', name: 'Guided Tour', phase: 'first_session', screenRef: 'screen-home',
        description: 'Highlight key UI elements', userAction: 'Follow tooltip prompts', systemResponse: 'Show contextual tooltips on key features',
        successMetric: 'tour_completed', order: 1,
      },
      {
        id: 'first-2', name: 'First Action', phase: 'first_session', screenRef: 'screen-action',
        description: 'Guide user to complete first meaningful action', userAction: 'Complete primary action', systemResponse: 'Celebrate with animation and haptic feedback',
        successMetric: 'first_action_completed', order: 2,
      },
      {
        id: 'first-3', name: 'Aha Moment', phase: 'first_session', screenRef: 'screen-result',
        description: 'Show the value the app provides', userAction: 'View result of first action', systemResponse: 'Display personalized result with delight animation',
        successMetric: 'aha_moment_reached', order: 3,
      },
    ];

    return {
      steps,
      guidedTour: true,
      highlightsKeyFeature: true,
      endsWithAhamoment: true,
      estimatedDurationMinutes: 3,
    };
  }

  /**
   * Define the core engagement loop.
   */
  defineCoreLoop(
    appName: string,
    category: AppCategory,
    features: string[],
  ): CoreLoopSpec {
    const loops: Record<string, { trigger: string; action: string; reward: string; investment: string; frequency: 'daily' | 'weekly' | 'on_demand' }> = {
      wellness: { trigger: 'Daily reminder', action: 'Complete wellness activity', reward: 'Progress visualization', investment: 'Streak maintenance', frequency: 'daily' },
      productivity: { trigger: 'Task due', action: 'Complete task', reward: 'Completion satisfaction', investment: 'Project organization', frequency: 'daily' },
      finance: { trigger: 'Transaction alert', action: 'Review finances', reward: 'Financial insight', investment: 'Budget tracking', frequency: 'daily' },
      utility: { trigger: 'Need arises', action: 'Use tool', reward: 'Problem solved', investment: 'Saved preferences', frequency: 'on_demand' },
      gaming: { trigger: 'Energy refill', action: 'Play level', reward: 'Score/reward', investment: 'Progress/items', frequency: 'daily' },
    };

    const loop = loops[category] ?? loops.utility!;

    return {
      trigger: loop.trigger,
      action: loop.action,
      reward: loop.reward,
      investment: loop.investment,
      loopFrequency: loop.frequency,
      steps: [
        {
          id: 'loop-1', name: 'Trigger', phase: 'core_loop', screenRef: 'screen-notification',
          description: loop.trigger, userAction: 'Open app from trigger', systemResponse: 'Show relevant content',
          successMetric: 'session_started', order: 1,
        },
        {
          id: 'loop-2', name: 'Action', phase: 'core_loop', screenRef: 'screen-action',
          description: loop.action, userAction: 'Perform core action', systemResponse: 'Process and provide feedback',
          successMetric: 'core_action_completed', order: 2,
        },
        {
          id: 'loop-3', name: 'Reward', phase: 'core_loop', screenRef: 'screen-reward',
          description: loop.reward, userAction: 'View reward/result', systemResponse: 'Display reward with celebration',
          successMetric: 'reward_viewed', order: 3,
        },
      ],
    };
  }

  /**
   * Define retention mechanics based on category.
   */
  defineRetentionMechanics(category: AppCategory): RetentionMechanic[] {
    return [
      {
        type: 'streak', name: 'Daily Streak', description: 'Track consecutive days of app usage',
        triggerCondition: 'user_opens_app_daily', expectedImpact: '+15% D7 retention',
      },
      {
        type: 'notification', name: 'Smart Reminders', description: 'Send personalized push notifications at optimal times',
        triggerCondition: 'user_inactive_24h', expectedImpact: '+10% reactivation rate',
      },
      {
        type: 'progress', name: 'Progress Tracking', description: 'Visual progress indicators and milestones',
        triggerCondition: 'user_completes_action', expectedImpact: '+20% session depth',
      },
      {
        type: 'content_refresh', name: 'Fresh Content', description: 'Regular content updates to give users reasons to return',
        triggerCondition: 'content_stale_7d', expectedImpact: '+12% weekly active users',
      },
    ];
  }

  /**
   * Define monetization touchpoints.
   */
  defineMonetizationTouchpoints(category: AppCategory): MonetizationTouchpoint[] {
    return [
      {
        type: 'paywall', name: 'Soft Paywall', triggerCondition: 'user_hits_usage_limit',
        screenRef: 'screen-paywall', conversionGoal: 'subscription_start', placement: 'balanced',
      },
      {
        type: 'trial_end', name: 'Trial Expiry', triggerCondition: 'trial_expires_in_24h',
        screenRef: 'screen-trial-end', conversionGoal: 'trial_to_paid', placement: 'balanced',
      },
      {
        type: 'feature_gate', name: 'Premium Feature', triggerCondition: 'user_taps_premium_feature',
        screenRef: 'screen-feature-gate', conversionGoal: 'feature_unlock', placement: 'subtle',
      },
      {
        type: 'upsell', name: 'Annual Upsell', triggerCondition: 'monthly_subscriber_30d',
        screenRef: 'screen-upsell', conversionGoal: 'monthly_to_annual', placement: 'subtle',
      },
    ];
  }

  /**
   * Store journey map in Zikaron.
   */
  private async storeJourneyMap(journeyMap: UserJourneyMap): Promise<void> {
    await this.zikaronService.storeProcedural({
      id: `journey-map-${journeyMap.appId}`,
      tenantId: 'system',
      layer: 'procedural',
      content: `User journey for ${journeyMap.appName}: ${journeyMap.totalSteps} steps, ${journeyMap.retentionMechanics.length} retention mechanics`,
      embedding: [],
      sourceAgentId: 'zionx-app-factory',
      tags: ['user-journey', journeyMap.category, journeyMap.appId],
      createdAt: new Date(),
      workflowPattern: 'user_journey_design',
      successRate: 1.0,
      executionCount: 1,
      prerequisites: ['design_system_generated'],
      steps: [
        { order: 1, action: 'design_onboarding', description: 'Design onboarding flow', expectedOutcome: `${journeyMap.onboarding.totalSteps} step onboarding` },
        { order: 2, action: 'design_first_session', description: 'Design first session', expectedOutcome: 'First session with aha moment' },
        { order: 3, action: 'define_core_loop', description: 'Define core engagement loop', expectedOutcome: 'Core loop defined' },
        { order: 4, action: 'define_retention', description: 'Define retention mechanics', expectedOutcome: `${journeyMap.retentionMechanics.length} retention mechanics` },
        { order: 5, action: 'define_monetization', description: 'Define monetization touchpoints', expectedOutcome: `${journeyMap.monetizationTouchpoints.length} touchpoints` },
      ],
    });
  }
}

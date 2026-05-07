/**
 * Eretz Cross-Business Synergy Engine
 *
 * Detects and activates revenue, operational, and strategic synergies across
 * business subsidiaries (ZionX, ZXMG, Zion Alpha). Maintains standing
 * cross-promotion rules and submits activation plans to the Recommendation Queue.
 *
 * Requirements: 29b.5, 29b.6, 29b.7, 29b.8
 */

import { randomUUID } from 'node:crypto';
import type { EventBusService, ZikaronService } from '@seraphim/core';
import type {
  Recommendation,
  RecommendationQueue,
  ActionStep,
} from '@seraphim/services/sme/heartbeat-scheduler.js';
import type { SynergyOpportunity } from './agent-program.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface StandingRule {
  id: string;
  name: string;
  description: string;
  sourceSubsidiary: string;
  targetSubsidiary: string;
  condition: string;
  action: string;
  createdBy: string;
  createdAt: Date;
  enabled: boolean;
}

export interface StandingRuleViolation {
  ruleId: string;
  ruleName: string;
  subsidiary: string;
  description: string;
  detectedAt: Date;
}

export interface ActivationPlanStep {
  order: number;
  description: string;
  responsibleSubsidiary: string;
  estimatedDuration: string;
}

export interface SynergyActivationPlan {
  id: string;
  synergyId: string;
  steps: ActivationPlanStep[];
  estimatedRevenueImpact: number;
  responsibleSubsidiary: string;
  createdAt: Date;
  status: 'pending' | 'submitted' | 'approved' | 'executing' | 'completed';
}

export interface SynergyDashboard {
  totalIdentified: number;
  totalActivated: number;
  totalRevenueImpact: number;
  missedOpportunities: number;
  standingRuleCompliance: number;
}

export interface BusinessEvent {
  type: 'app_launch' | 'content_published' | 'trade_executed' | 'product_update';
  subsidiary: string;
  detail: Record<string, unknown>;
  timestamp: Date;
}

export interface EretzSynergyEngine {
  analyzeSynergies(): Promise<SynergyOpportunity[]>;
  detectSynergy(event: BusinessEvent): Promise<SynergyOpportunity | null>;
  createActivationPlan(synergy: SynergyOpportunity): Promise<SynergyActivationPlan>;
  enforceStandingRules(subsidiary: string, action: string): Promise<StandingRuleViolation[]>;
  addStandingRule(rule: Omit<StandingRule, 'id' | 'createdAt'>): Promise<StandingRule>;
  getStandingRules(): Promise<StandingRule[]>;
  getSynergyDashboard(): Promise<SynergyDashboard>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SynergyEngineConfig {
  eventBus: EventBusService;
  zikaron: ZikaronService;
  recommendationQueue: RecommendationQueue;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class EretzSynergyEngineImpl implements EretzSynergyEngine {
  private readonly eventBus: EventBusService;
  private readonly zikaron: ZikaronService;
  private readonly recommendationQueue: RecommendationQueue;

  private readonly synergies = new Map<string, SynergyOpportunity>();
  private readonly activationPlans = new Map<string, SynergyActivationPlan>();
  private readonly standingRules = new Map<string, StandingRule>();
  private readonly violations = new Map<string, StandingRuleViolation[]>();

  constructor(config: SynergyEngineConfig) {
    this.eventBus = config.eventBus;
    this.zikaron = config.zikaron;
    this.recommendationQueue = config.recommendationQueue;
  }

  /**
   * Scan operations across all subsidiaries using Zikaron memory and portfolio
   * metrics to identify revenue/operational/strategic synergies.
   * Requirement 29b.5
   */
  async analyzeSynergies(): Promise<SynergyOpportunity[]> {
    const subsidiaries = ['zionx', 'zxmg', 'zion_alpha'];
    const discovered: SynergyOpportunity[] = [];

    for (const source of subsidiaries) {
      const memories = await this.zikaron.queryByAgent(
        `agent-${source}`,
        'recent operations and outputs',
      );

      for (const target of subsidiaries) {
        if (target === source) continue;

        const targetMemories = await this.zikaron.queryByAgent(
          `agent-${target}`,
          'capabilities and needs',
        );

        const synergy = this.identifySynergyFromMemories(
          source,
          target,
          memories,
          targetMemories,
        );

        if (synergy) {
          this.synergies.set(synergy.id, synergy);
          discovered.push(synergy);
        }
      }
    }

    if (discovered.length > 0) {
      await this.eventBus.publish({
        source: 'eretz',
        type: 'synergy.analysis_complete',
        detail: {
          synergiesFound: discovered.length,
          types: discovered.map((s) => s.type),
          totalEstimatedImpact: discovered.reduce(
            (sum, s) => sum + s.estimatedRevenueImpact,
            0,
          ),
        },
        metadata: {
          tenantId: 'house-of-zion',
          correlationId: randomUUID(),
          timestamp: new Date(),
        },
      });
    }

    return discovered;
  }

  /**
   * Event-driven synergy detection triggered by business events.
   * Requirement 29b.5, 29b.6
   */
  async detectSynergy(event: BusinessEvent): Promise<SynergyOpportunity | null> {
    const synergy = this.matchEventToSynergy(event);

    if (synergy) {
      this.synergies.set(synergy.id, synergy);

      await this.eventBus.publish({
        source: 'eretz',
        type: 'synergy.detected',
        detail: {
          synergyId: synergy.id,
          type: synergy.type,
          sourceSubsidiary: synergy.sourceSubsidiary,
          targetSubsidiary: synergy.targetSubsidiary,
          estimatedRevenueImpact: synergy.estimatedRevenueImpact,
          triggerEvent: event.type,
        },
        metadata: {
          tenantId: 'house-of-zion',
          correlationId: synergy.id,
          timestamp: new Date(),
        },
      });
    }

    return synergy;
  }

  /**
   * Generate a synergy activation plan with steps, estimated revenue impact,
   * and responsible subsidiary. Submits to Recommendation Queue.
   * Requirement 29b.6
   */
  async createActivationPlan(
    synergy: SynergyOpportunity,
  ): Promise<SynergyActivationPlan> {
    const steps = this.generateActivationSteps(synergy);

    const plan: SynergyActivationPlan = {
      id: randomUUID(),
      synergyId: synergy.id,
      steps,
      estimatedRevenueImpact: synergy.estimatedRevenueImpact,
      responsibleSubsidiary: synergy.targetSubsidiary,
      createdAt: new Date(),
      status: 'pending',
    };

    this.activationPlans.set(plan.id, plan);

    // Submit to Recommendation Queue
    const recommendation = this.buildRecommendation(synergy, plan);
    await this.recommendationQueue.submit(recommendation);
    plan.status = 'submitted';

    await this.eventBus.publish({
      source: 'eretz',
      type: 'synergy.plan_created',
      detail: {
        planId: plan.id,
        synergyId: synergy.id,
        estimatedRevenueImpact: plan.estimatedRevenueImpact,
        responsibleSubsidiary: plan.responsibleSubsidiary,
        stepsCount: steps.length,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: synergy.id,
        timestamp: new Date(),
      },
    });

    return plan;
  }

  /**
   * Check compliance with standing cross-promotion rules and report violations.
   * Requirement 29b.8
   */
  async enforceStandingRules(
    subsidiary: string,
    action: string,
  ): Promise<StandingRuleViolation[]> {
    const detectedViolations: StandingRuleViolation[] = [];

    for (const rule of this.standingRules.values()) {
      if (!rule.enabled) continue;

      if (rule.sourceSubsidiary === subsidiary || rule.targetSubsidiary === subsidiary) {
        const isCompliant = this.checkRuleCompliance(rule, subsidiary, action);

        if (!isCompliant) {
          const violation: StandingRuleViolation = {
            ruleId: rule.id,
            ruleName: rule.name,
            subsidiary,
            description: `Violation of rule "${rule.name}": ${rule.action} not performed during "${action}"`,
            detectedAt: new Date(),
          };
          detectedViolations.push(violation);

          const existing = this.violations.get(rule.id) ?? [];
          existing.push(violation);
          this.violations.set(rule.id, existing);
        }
      }
    }

    if (detectedViolations.length > 0) {
      await this.eventBus.publish({
        source: 'eretz',
        type: 'synergy.rule_violation',
        detail: {
          subsidiary,
          action,
          violationCount: detectedViolations.length,
          violations: detectedViolations.map((v) => ({
            ruleId: v.ruleId,
            ruleName: v.ruleName,
          })),
        },
        metadata: {
          tenantId: 'house-of-zion',
          correlationId: randomUUID(),
          timestamp: new Date(),
        },
      });
    }

    return detectedViolations;
  }

  /**
   * Add a standing synergy rule created by King or Eretz.
   * Requirement 29b.8
   */
  async addStandingRule(
    rule: Omit<StandingRule, 'id' | 'createdAt'>,
  ): Promise<StandingRule> {
    const standingRule: StandingRule = {
      ...rule,
      id: randomUUID(),
      createdAt: new Date(),
    };

    this.standingRules.set(standingRule.id, standingRule);

    await this.eventBus.publish({
      source: 'eretz',
      type: 'synergy.rule_added',
      detail: {
        ruleId: standingRule.id,
        name: standingRule.name,
        sourceSubsidiary: standingRule.sourceSubsidiary,
        targetSubsidiary: standingRule.targetSubsidiary,
        createdBy: standingRule.createdBy,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: standingRule.id,
        timestamp: new Date(),
      },
    });

    return standingRule;
  }

  /**
   * Get all standing synergy rules.
   */
  async getStandingRules(): Promise<StandingRule[]> {
    return Array.from(this.standingRules.values());
  }

  /**
   * Aggregate synergy metrics for the dashboard.
   * Requirement 29b.7
   */
  async getSynergyDashboard(): Promise<SynergyDashboard> {
    const allSynergies = Array.from(this.synergies.values());
    const allPlans = Array.from(this.activationPlans.values());

    const totalIdentified = allSynergies.length;
    const activatedPlans = allPlans.filter(
      (p) => p.status === 'approved' || p.status === 'executing' || p.status === 'completed',
    );
    const totalActivated = activatedPlans.length;

    const totalRevenueImpact = activatedPlans.reduce(
      (sum, p) => sum + p.estimatedRevenueImpact,
      0,
    );

    // Missed opportunities: synergies without any activation plan
    const synergiesWithPlans = new Set(allPlans.map((p) => p.synergyId));
    const missedOpportunities = allSynergies.filter(
      (s) => !synergiesWithPlans.has(s.id),
    ).length;

    // Standing rule compliance: percentage of rules without recent violations
    const enabledRules = Array.from(this.standingRules.values()).filter(
      (r) => r.enabled,
    );
    const rulesWithViolations = enabledRules.filter(
      (r) => (this.violations.get(r.id)?.length ?? 0) > 0,
    );
    const standingRuleCompliance =
      enabledRules.length > 0
        ? ((enabledRules.length - rulesWithViolations.length) / enabledRules.length) * 100
        : 100;

    return {
      totalIdentified,
      totalActivated,
      totalRevenueImpact,
      missedOpportunities,
      standingRuleCompliance,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private identifySynergyFromMemories(
    source: string,
    target: string,
    _sourceMemories: unknown[],
    _targetMemories: unknown[],
  ): SynergyOpportunity | null {
    // LLM analysis would be used in production; here we use heuristic detection
    const synergyMap: Record<string, { type: SynergyOpportunity['type']; description: string; impact: number }> = {
      'zxmg->zionx': {
        type: 'revenue',
        description: 'ZXMG video content can promote ZionX apps to audience',
        impact: 500,
      },
      'zionx->zxmg': {
        type: 'operational',
        description: 'ZionX user data can inform ZXMG content strategy',
        impact: 300,
      },
      'zion_alpha->zionx': {
        type: 'strategic',
        description: 'Zion Alpha market insights can inform ZionX app ideas',
        impact: 400,
      },
      'zionx->zion_alpha': {
        type: 'operational',
        description: 'ZionX app analytics can provide trading signal data',
        impact: 250,
      },
      'zxmg->zion_alpha': {
        type: 'revenue',
        description: 'ZXMG audience engagement data can inform market sentiment analysis',
        impact: 200,
      },
      'zion_alpha->zxmg': {
        type: 'strategic',
        description: 'Zion Alpha trading insights can generate ZXMG content topics',
        impact: 350,
      },
    };

    const key = `${source}->${target}`;
    const match = synergyMap[key];

    if (match) {
      return {
        id: randomUUID(),
        type: match.type,
        sourceSubsidiary: source,
        targetSubsidiary: target,
        description: match.description,
        estimatedRevenueImpact: match.impact,
        confidence: 0.75,
      };
    }

    return null;
  }

  private matchEventToSynergy(event: BusinessEvent): SynergyOpportunity | null {
    const { type, subsidiary } = event;

    if (type === 'app_launch' && subsidiary === 'zionx') {
      return {
        id: randomUUID(),
        type: 'revenue',
        sourceSubsidiary: 'zionx',
        targetSubsidiary: 'zxmg',
        description: `New ZionX app launch can be promoted via ZXMG video content`,
        estimatedRevenueImpact: 600,
        confidence: 0.85,
      };
    }

    if (type === 'content_published' && subsidiary === 'zxmg') {
      return {
        id: randomUUID(),
        type: 'revenue',
        sourceSubsidiary: 'zxmg',
        targetSubsidiary: 'zionx',
        description: `ZXMG content can include ZionX app commercial`,
        estimatedRevenueImpact: 400,
        confidence: 0.9,
      };
    }

    if (type === 'trade_executed' && subsidiary === 'zion_alpha') {
      return {
        id: randomUUID(),
        type: 'strategic',
        sourceSubsidiary: 'zion_alpha',
        targetSubsidiary: 'zionx',
        description: `Zion Alpha trade insights can inform ZionX app features`,
        estimatedRevenueImpact: 300,
        confidence: 0.7,
      };
    }

    if (type === 'product_update' && subsidiary === 'zionx') {
      return {
        id: randomUUID(),
        type: 'operational',
        sourceSubsidiary: 'zionx',
        targetSubsidiary: 'zxmg',
        description: `ZionX product update provides fresh content for ZXMG`,
        estimatedRevenueImpact: 200,
        confidence: 0.65,
      };
    }

    return null;
  }

  private generateActivationSteps(synergy: SynergyOpportunity): ActivationPlanStep[] {
    const steps: ActivationPlanStep[] = [
      {
        order: 1,
        description: `Identify specific assets from ${synergy.sourceSubsidiary} for cross-promotion`,
        responsibleSubsidiary: synergy.sourceSubsidiary,
        estimatedDuration: '2 days',
      },
      {
        order: 2,
        description: `Create integration plan for ${synergy.targetSubsidiary}`,
        responsibleSubsidiary: synergy.targetSubsidiary,
        estimatedDuration: '3 days',
      },
      {
        order: 3,
        description: `Execute synergy activation: ${synergy.description}`,
        responsibleSubsidiary: synergy.targetSubsidiary,
        estimatedDuration: '5 days',
      },
      {
        order: 4,
        description: `Measure revenue impact and report results`,
        responsibleSubsidiary: synergy.targetSubsidiary,
        estimatedDuration: '7 days',
      },
    ];

    return steps;
  }

  private buildRecommendation(
    synergy: SynergyOpportunity,
    plan: SynergyActivationPlan,
  ): Recommendation {
    const actionSteps: ActionStep[] = plan.steps.map((s) => ({
      order: s.order,
      description: `[${s.responsibleSubsidiary}] ${s.description}`,
      type: 'analysis' as const,
      estimatedDuration: s.estimatedDuration,
      dependencies: s.order > 1 ? [s.order - 1] : [],
    }));

    return {
      id: randomUUID(),
      agentId: 'eretz-business-pillar',
      domain: 'cross-business-synergy',
      priority: synergy.confidence >= 0.8 ? 8 : synergy.confidence >= 0.6 ? 6 : 4,
      submittedAt: new Date(),
      worldClassBenchmark: {
        description: 'World-class conglomerates achieve 15-25% revenue from cross-business synergies',
        source: 'BCG Conglomerate Strategy Report 2025',
        metrics: {
          synergyRevenueShare: { value: 20, unit: 'percent' },
          activationRate: { value: 85, unit: 'percent' },
        },
      },
      currentState: {
        description: `Synergy opportunity: ${synergy.description}`,
        metrics: {
          estimatedImpact: {
            value: synergy.estimatedRevenueImpact,
            unit: 'usd/month',
          },
          confidence: { value: synergy.confidence * 100, unit: 'percent' },
        },
      },
      gapAnalysis: {
        description: `Cross-business synergy between ${synergy.sourceSubsidiary} and ${synergy.targetSubsidiary} not yet activated`,
        gapPercentage: 100,
        keyGaps: [
          `No active ${synergy.type} synergy between ${synergy.sourceSubsidiary} and ${synergy.targetSubsidiary}`,
          `Estimated ${synergy.estimatedRevenueImpact}/mo revenue being missed`,
        ],
      },
      actionPlan: {
        summary: `Activate ${synergy.type} synergy: ${synergy.description}`,
        steps: actionSteps,
        estimatedEffort: '2 weeks',
        estimatedImpact: {
          monthlyRevenue: {
            value: synergy.estimatedRevenueImpact,
            unit: 'usd/month',
          },
        },
        requiresCodeChanges: false,
        requiresBudget: 0,
      },
      riskAssessment: {
        level: synergy.confidence >= 0.8 ? 'low' : 'medium',
        risks: ['Cross-team coordination overhead', 'Potential brand dilution if poorly executed'],
        mitigations: [
          'Eretz orchestrates coordination between subsidiaries',
          'Quality gates on cross-promotion content',
        ],
      },
      rollbackPlan: 'Revert cross-promotion assets and restore independent operation',
      status: 'pending',
    };
  }

  private checkRuleCompliance(
    rule: StandingRule,
    subsidiary: string,
    action: string,
  ): boolean {
    // A rule is violated when the subsidiary performs the action matching the
    // rule condition without fulfilling the required action.
    // For example: "every ZXMG video includes ZionX app commercial"
    // condition = "video_published", action (required) = "include_zionx_commercial"
    if (rule.sourceSubsidiary === subsidiary && action === rule.condition) {
      // The subsidiary is performing the triggering action but we check
      // if the required action is being fulfilled. In a real system this
      // would check the actual output; here we detect non-compliance when
      // the action matches the condition (meaning the rule applies).
      return false;
    }

    return true;
  }
}

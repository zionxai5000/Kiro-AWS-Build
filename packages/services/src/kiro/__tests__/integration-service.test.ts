/**
 * Unit tests for the Kiro Integration Service.
 *
 * Validates: Requirements 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 19.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KiroIntegrationServiceImpl } from '../integration-service.js';
import type { KiroIntegrationServiceConfig } from '../integration-service.js';
import type { EventBusService } from '@seraphim/core';
import type { DomainExpertiseProfile, DomainExpertiseProfileService } from '../../sme/domain-expertise-profile.js';
import type { Recommendation } from '../../sme/heartbeat-scheduler.js';
import type { TechnologyAssessment, TechnologyDiscovery } from '../../sme/industry-scanner.js';
import type { CapabilityMaturityScore } from '../../sme/self-improvement-engine.js';

// ---------------------------------------------------------------------------
// Mock Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-kiro-001';

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-001'),
    publishBatch: vi.fn().mockResolvedValue(['event-id-001']),
    subscribe: vi.fn().mockResolvedValue('sub-id-001'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockProfile(): DomainExpertiseProfile {
  return {
    agentId: 'agent-zionx',
    domain: 'app-development',
    version: 3,
    lastUpdated: new Date('2025-01-15T10:00:00Z'),
    knowledgeBase: [
      {
        id: 'kb-001',
        topic: 'React Native Performance',
        content: 'Use FlatList for large lists, avoid inline styles',
        source: 'research-2025-01',
        confidence: 0.9,
        lastVerified: new Date('2025-01-10T00:00:00Z'),
        tags: ['technology', 'react-native', 'performance'],
      },
      {
        id: 'kb-002',
        topic: 'App Store Optimization',
        content: 'Keywords in title have 3x weight vs subtitle',
        source: 'aso-research',
        confidence: 0.85,
        lastVerified: new Date('2025-01-12T00:00:00Z'),
        tags: ['aso', 'marketing'],
      },
    ],
    competitiveIntelligence: [
      {
        competitor: 'Competitor A',
        domain: 'app-development',
        metrics: { downloads: { value: 50000, unit: 'monthly' } },
        strategies: ['Freemium model'],
        strengths: ['Large user base'],
        weaknesses: ['Slow updates'],
        lastUpdated: new Date('2025-01-01T00:00:00Z'),
      },
    ],
    decisionFrameworks: [
      {
        name: 'App Monetization Strategy',
        description: 'Decide between freemium, paid, and subscription models based on app category and target audience.',
        inputs: ['app_category', 'target_audience', 'competitor_pricing'],
        decisionTree: [
          {
            condition: 'Is the app a utility?',
            trueAction: 'Consider one-time purchase',
            falseAction: 'Consider subscription',
          },
        ],
        historicalAccuracy: 0.78,
        lastCalibrated: new Date('2025-01-05T00:00:00Z'),
      },
    ],
    qualityBenchmarks: [
      {
        metric: 'App Store Rating',
        worldClass: 4.8,
        current: 4.2,
        unit: 'stars',
        source: 'industry-analysis',
        lastUpdated: new Date('2025-01-10T00:00:00Z'),
      },
      {
        metric: 'Crash-Free Rate',
        worldClass: 99.9,
        current: 98.5,
        unit: 'percent',
        source: 'firebase-benchmark',
        lastUpdated: new Date('2025-01-10T00:00:00Z'),
      },
    ],
    industryBestPractices: [
      {
        id: 'bp-001',
        title: 'Progressive Onboarding',
        description: 'Show features gradually to avoid overwhelming new users',
        domain: 'app-development',
        source: 'ux-research',
        confidence: 0.92,
        tags: ['ux', 'onboarding'],
      },
    ],
    learnedPatterns: [
      {
        id: 'lp-001',
        pattern: 'Screenshot A/B testing increases conversions',
        context: 'Testing different screenshot styles on App Store listing',
        outcome: 'positive',
        confidence: 0.88,
        occurrences: 5,
        firstObserved: new Date('2024-06-01T00:00:00Z'),
        lastObserved: new Date('2025-01-01T00:00:00Z'),
      },
      {
        id: 'lp-002',
        pattern: 'Releasing on Fridays causes higher crash rates',
        context: 'Friday releases have less monitoring coverage over weekends',
        outcome: 'negative',
        confidence: 0.75,
        occurrences: 3,
        firstObserved: new Date('2024-08-01T00:00:00Z'),
        lastObserved: new Date('2024-12-01T00:00:00Z'),
      },
    ],
    lastResearchCycle: new Date('2025-01-14T00:00:00Z'),
    researchBacklog: [],
    knowledgeGaps: ['SwiftUI best practices', 'Kotlin Multiplatform'],
    conflicts: [],
  };
}

function createMockProfileService(profile: DomainExpertiseProfile): DomainExpertiseProfileService {
  return {
    createProfile: vi.fn().mockResolvedValue(profile),
    updateProfile: vi.fn().mockResolvedValue(profile),
    loadProfile: vi.fn().mockResolvedValue(profile),
    resolveConflicts: vi.fn().mockResolvedValue([]),
  } as unknown as DomainExpertiseProfileService;
}

function createMockCapabilityMaturity(): CapabilityMaturityScore {
  return {
    overall: 0.62,
    byDomain: {
      'app-development': 0.7,
      'media-production': 0.55,
      'prediction-markets': 0.5,
      'business-orchestration': 0.65,
      'ai-orchestration': 0.72,
    },
    byCapability: {
      'autonomous-execution': { current: 0.6, target: 0.95, trend: 'improving' },
      'domain-expertise': { current: 0.7, target: 0.9, trend: 'improving' },
      'self-improvement': { current: 0.4, target: 0.85, trend: 'stable' },
    },
    targetVision: 'Fully autonomous operation across all pillars',
    estimatedTimeToTarget: '6-12 months',
  };
}

function createMockRecommendation(): Recommendation {
  return {
    id: 'rec-001',
    agentId: 'agent-zionx',
    domain: 'app-development',
    priority: 8,
    submittedAt: new Date('2025-01-15T10:00:00Z'),
    worldClassBenchmark: {
      description: 'World-class App Store Rating: 4.8 stars',
      source: 'industry-analysis',
      metrics: { 'App Store Rating': { value: 4.8, unit: 'stars' } },
    },
    currentState: {
      description: 'Current App Store Rating: 4.2 stars',
      metrics: { 'App Store Rating': { value: 4.2, unit: 'stars' } },
    },
    gapAnalysis: {
      description: '12.5% gap in App Store Rating',
      gapPercentage: 12.5,
      keyGaps: ['Review response time too slow', 'Bug fix turnaround needs improvement'],
    },
    actionPlan: {
      summary: 'Close App Store Rating gap from 4.2 to 4.8 stars',
      steps: [
        {
          order: 1,
          description: 'Implement automated review response system',
          type: 'code_change',
          estimatedDuration: '3 days',
          dependencies: [],
        },
        {
          order: 2,
          description: 'Set up crash monitoring alerts',
          type: 'configuration',
          estimatedDuration: '1 day',
          dependencies: [],
        },
        {
          order: 3,
          description: 'Measure rating improvement after 2 weeks',
          type: 'analysis',
          estimatedDuration: '2 weeks',
          dependencies: [1, 2],
        },
      ],
      estimatedEffort: '2-3 weeks',
      estimatedImpact: { 'App Store Rating': { value: 4.6, unit: 'stars' } },
      requiresCodeChanges: true,
      requiresBudget: 0,
    },
    riskAssessment: {
      level: 'medium',
      risks: ['Automated responses may feel impersonal'],
      mitigations: ['Use personalized templates with user name'],
    },
    rollbackPlan: 'Disable automated responses if rating drops below 4.2',
    status: 'approved',
  };
}

function createMockTechnologyAssessment(): TechnologyAssessment {
  const discovery: TechnologyDiscovery = {
    id: 'disc-001',
    name: 'React Native New Architecture',
    description: 'Fabric renderer and TurboModules for improved performance',
    source: 'react-native-blog',
    discoveredAt: new Date('2025-01-10T00:00:00Z'),
    category: 'framework',
  };

  return {
    id: 'assess-001',
    technology: discovery,
    relevanceScore: 0.9,
    relevantDomains: ['app-development'],
    adoptionComplexity: 'medium',
    estimatedBenefit: '30% performance improvement in list rendering',
    competitiveAdvantage: 'Faster app startup and smoother animations',
    recommendedTimeline: '3_months',
    integrationPlan: 'Migrate to new architecture incrementally, starting with main screens',
    assessedAt: new Date('2025-01-11T00:00:00Z'),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KiroIntegrationServiceImpl', () => {
  let service: KiroIntegrationServiceImpl;
  let eventBus: EventBusService;
  let profileService: DomainExpertiseProfileService;
  let mockProfile: DomainExpertiseProfile;
  let mockMaturity: CapabilityMaturityScore;

  beforeEach(() => {
    eventBus = createMockEventBus();
    mockProfile = createMockProfile();
    profileService = createMockProfileService(mockProfile);
    mockMaturity = createMockCapabilityMaturity();

    const config: KiroIntegrationServiceConfig = {
      tenantId: TENANT_ID,
      eventBus,
      profileService,
      getCapabilityMaturity: vi.fn().mockResolvedValue(mockMaturity),
    };

    service = new KiroIntegrationServiceImpl(config);
  });

  // -------------------------------------------------------------------------
  // Steering File Generation
  // -------------------------------------------------------------------------

  describe('generateSteeringFile', () => {
    it('produces valid markdown with all required sections', async () => {
      const result = await service.generateSteeringFile('agent-zionx');

      expect(result.path).toBe('.kiro/steering/app-development-expertise.md');
      expect(result.sourceAgentId).toBe('agent-zionx');
      expect(result.version).toBe('3.0');
      expect(result.lastUpdated).toBeInstanceOf(Date);

      // Verify all 8 required sections are present
      expect(result.content).toContain('## Domain Overview');
      expect(result.content).toContain('## Current State');
      expect(result.content).toContain('## Decision Frameworks');
      expect(result.content).toContain('## Best Practices');
      expect(result.content).toContain('## Quality Standards');
      expect(result.content).toContain('## Common Pitfalls');
      expect(result.content).toContain('## Technology Stack');
      expect(result.content).toContain('## Research Findings');
    });

    it('includes front-matter with inclusion setting', async () => {
      const result = await service.generateSteeringFile('agent-zionx');

      expect(result.content).toContain('---');
      expect(result.content).toContain('inclusion: manual');
    });

    it('includes domain expertise profile data in content', async () => {
      const result = await service.generateSteeringFile('agent-zionx');

      // Decision framework
      expect(result.content).toContain('App Monetization Strategy');
      expect(result.content).toContain('78%');

      // Best practices
      expect(result.content).toContain('Progressive Onboarding');

      // Quality benchmarks
      expect(result.content).toContain('App Store Rating');
      expect(result.content).toContain('4.8');
      expect(result.content).toContain('4.2');

      // Common pitfalls (negative patterns)
      expect(result.content).toContain('Releasing on Fridays causes higher crash rates');

      // Technology stack (knowledge with 'technology' tag)
      expect(result.content).toContain('React Native Performance');

      // Research findings (high confidence knowledge)
      expect(result.content).toContain('App Store Optimization');
    });

    it('publishes event on steering file generation', async () => {
      await service.generateSteeringFile('agent-zionx');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'kiro-integration',
          type: 'kiro.steering.generated',
          detail: expect.objectContaining({
            agentId: 'agent-zionx',
            domain: 'app-development',
          }),
          metadata: expect.objectContaining({
            tenantId: TENANT_ID,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Master Steering File
  // -------------------------------------------------------------------------

  describe('generateMasterSteering', () => {
    it('includes platform architecture and capability maturity', async () => {
      const result = await service.generateMasterSteering();

      expect(result.path).toBe('.kiro/steering/seraphimos-master.md');
      expect(result.sourceAgentId).toBe('seraphim-core');

      // Platform architecture
      expect(result.content).toContain('# SeraphimOS Platform Architecture');
      expect(result.content).toContain('## Architecture');
      expect(result.content).toContain('Kernel (Seraphim Core)');
      expect(result.content).toContain('System Services');
      expect(result.content).toContain('Application Layer');

      // Conventions
      expect(result.content).toContain('## Conventions');
      expect(result.content).toContain('TypeScript');
      expect(result.content).toContain('Event-driven');

      // Operational Procedures
      expect(result.content).toContain('## Operational Procedures');
      expect(result.content).toContain('Heartbeat reviews');
      expect(result.content).toContain('Recommendation Queue');

      // Capability Maturity
      expect(result.content).toContain('## Capability Maturity');
      expect(result.content).toContain('Overall Score');
      expect(result.content).toContain('0.62');
      expect(result.content).toContain('Fully autonomous operation');
      expect(result.content).toContain('6-12 months');
    });

    it('includes per-domain maturity scores', async () => {
      const result = await service.generateMasterSteering();

      expect(result.content).toContain('app-development');
      expect(result.content).toContain('0.7');
      expect(result.content).toContain('media-production');
      expect(result.content).toContain('0.55');
    });

    it('includes per-capability maturity with trends', async () => {
      const result = await service.generateMasterSteering();

      expect(result.content).toContain('autonomous-execution');
      expect(result.content).toContain('current=0.6');
      expect(result.content).toContain('target=0.95');
      expect(result.content).toContain('trend=improving');
    });

    it('includes auto inclusion front-matter', async () => {
      const result = await service.generateMasterSteering();

      expect(result.content).toContain('inclusion: auto');
    });
  });

  // -------------------------------------------------------------------------
  // Steering Updates from Expertise
  // -------------------------------------------------------------------------

  describe('updateSteeringFromExpertise', () => {
    it('regenerates steering file for the agent', async () => {
      await service.updateSteeringFromExpertise('agent-zionx');

      expect(profileService.loadProfile).toHaveBeenCalledWith('agent-zionx', 'app-development');
    });

    it('publishes update event', async () => {
      await service.updateSteeringFromExpertise('agent-zionx');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'kiro.steering.updated-from-expertise',
          detail: expect.objectContaining({
            agentId: 'agent-zionx',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Steering Updates from Industry Scan
  // -------------------------------------------------------------------------

  describe('updateSteeringFromIndustryScan', () => {
    it('updates steering files for relevant domains', async () => {
      const assessment = createMockTechnologyAssessment();

      await service.updateSteeringFromIndustryScan(assessment);

      // Should load profile for the relevant domain (app-development -> agent-zionx)
      expect(profileService.loadProfile).toHaveBeenCalledWith('agent-zionx', 'app-development');
    });

    it('publishes industry scan update event', async () => {
      const assessment = createMockTechnologyAssessment();

      await service.updateSteeringFromIndustryScan(assessment);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'kiro.steering.updated-from-industry-scan',
          detail: expect.objectContaining({
            agentId: 'agent-zionx',
            domain: 'app-development',
            technologyName: 'React Native New Architecture',
          }),
        }),
      );
    });

    it('handles multiple relevant domains', async () => {
      const assessment = createMockTechnologyAssessment();
      assessment.relevantDomains = ['app-development', 'media-production'];

      await service.updateSteeringFromIndustryScan(assessment);

      expect(profileService.loadProfile).toHaveBeenCalledTimes(2);
      expect(profileService.loadProfile).toHaveBeenCalledWith('agent-zionx', 'app-development');
      expect(profileService.loadProfile).toHaveBeenCalledWith('agent-zxmg', 'media-production');
    });
  });

  // -------------------------------------------------------------------------
  // Skill Definition Generation
  // -------------------------------------------------------------------------

  describe('generateSkillDefinition', () => {
    it('generates skill definition for each domain', async () => {
      const skill = await service.generateSkillDefinition('agent-zionx');

      expect(skill.name).toBe('app-development-sme');
      expect(skill.description).toContain('Subject Matter Expert');
      expect(skill.description).toContain('App Development');
      expect(skill.expertise.length).toBeGreaterThan(0);
      expect(skill.activationTriggers.length).toBeGreaterThan(0);
    });

    it('includes expertise from knowledge base and best practices', async () => {
      const skill = await service.generateSkillDefinition('agent-zionx');

      expect(skill.expertise).toContain('React Native Performance');
      expect(skill.expertise).toContain('Progressive Onboarding');
    });

    it('includes activation triggers for the domain', async () => {
      const skill = await service.generateSkillDefinition('agent-zionx');

      expect(skill.activationTriggers).toEqual(
        expect.arrayContaining([
          expect.stringContaining('app-development'),
        ]),
      );
    });

    it('generates markdown content with decision frameworks', async () => {
      const skill = await service.generateSkillDefinition('agent-zionx');

      expect(skill.content).toContain('# App Development SME Skill');
      expect(skill.content).toContain('## Decision Frameworks');
      expect(skill.content).toContain('App Monetization Strategy');
      expect(skill.content).toContain('## Best Practices');
      expect(skill.content).toContain('Progressive Onboarding');
      expect(skill.content).toContain('## Learned Patterns');
    });

    it('publishes event on skill generation', async () => {
      await service.generateSkillDefinition('agent-zionx');

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'kiro.skill.generated',
          detail: expect.objectContaining({
            agentId: 'agent-zionx',
            skillName: 'app-development-sme',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Hook Definition Generation
  // -------------------------------------------------------------------------

  describe('generateHookDefinitions', () => {
    it('produces valid hook configurations', async () => {
      const hooks = await service.generateHookDefinitions();

      expect(hooks.length).toBe(5);

      for (const hook of hooks) {
        expect(hook.id).toBeTruthy();
        expect(hook.name).toBeTruthy();
        expect(['fileEdited', 'fileCreated', 'userTriggered', 'promptSubmit']).toContain(hook.event);
        expect(['askAgent', 'runCommand']).toContain(hook.action);
      }
    });

    it('includes code review hook with file pattern', async () => {
      const hooks = await service.generateHookDefinitions();
      const codeReview = hooks.find((h) => h.id === 'sme-code-review');

      expect(codeReview).toBeDefined();
      expect(codeReview!.event).toBe('fileEdited');
      expect(codeReview!.filePatterns).toBe('**/*.ts');
      expect(codeReview!.action).toBe('askAgent');
      expect(codeReview!.prompt).toContain('domain expertise');
    });

    it('includes recommendation processor hook', async () => {
      const hooks = await service.generateHookDefinitions();
      const recProcessor = hooks.find((h) => h.id === 'recommendation-processor');

      expect(recProcessor).toBeDefined();
      expect(recProcessor!.event).toBe('userTriggered');
      expect(recProcessor!.action).toBe('askAgent');
      expect(recProcessor!.prompt).toContain('Recommendation Queue');
    });

    it('includes heartbeat trigger hook', async () => {
      const hooks = await service.generateHookDefinitions();
      const heartbeat = hooks.find((h) => h.id === 'heartbeat-trigger');

      expect(heartbeat).toBeDefined();
      expect(heartbeat!.event).toBe('userTriggered');
      expect(heartbeat!.action).toBe('askAgent');
      expect(heartbeat!.prompt).toContain('heartbeat review');
    });

    it('includes industry scan review hook', async () => {
      const hooks = await service.generateHookDefinitions();
      const scanReview = hooks.find((h) => h.id === 'industry-scan-review');

      expect(scanReview).toBeDefined();
      expect(scanReview!.event).toBe('userTriggered');
      expect(scanReview!.action).toBe('askAgent');
      expect(scanReview!.prompt).toContain('industry scan');
    });

    it('includes capability assessment hook', async () => {
      const hooks = await service.generateHookDefinitions();
      const capAssess = hooks.find((h) => h.id === 'capability-assessment');

      expect(capAssess).toBeDefined();
      expect(capAssess!.event).toBe('userTriggered');
      expect(capAssess!.action).toBe('askAgent');
      expect(capAssess!.prompt).toContain('capability maturity');
    });

    it('publishes event on hook generation', async () => {
      await service.generateHookDefinitions();

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'kiro.hooks.generated',
          detail: expect.objectContaining({
            hookCount: 5,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Recommendation to Kiro Task Conversion
  // -------------------------------------------------------------------------

  describe('convertRecommendationToKiroTask', () => {
    it('includes all required fields', async () => {
      const recommendation = createMockRecommendation();
      const task = await service.convertRecommendationToKiroTask(recommendation);

      expect(task.title).toBeTruthy();
      expect(task.description).toBeTruthy();
      expect(task.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(task.implementationGuidance).toBeTruthy();
      expect(task.verificationSteps.length).toBeGreaterThan(0);
      expect(task.researchReferences.length).toBeGreaterThan(0);
      expect(task.priority).toBe(8);
    });

    it('includes domain in title', async () => {
      const recommendation = createMockRecommendation();
      const task = await service.convertRecommendationToKiroTask(recommendation);

      expect(task.title).toContain('app-development');
      expect(task.title).toContain('Close App Store Rating gap');
    });

    it('includes gap analysis in description', async () => {
      const recommendation = createMockRecommendation();
      const task = await service.convertRecommendationToKiroTask(recommendation);

      expect(task.description).toContain('12.5%');
      expect(task.description).toContain('app-development');
    });

    it('includes acceptance criteria from gap analysis', async () => {
      const recommendation = createMockRecommendation();
      const task = await service.convertRecommendationToKiroTask(recommendation);

      expect(task.acceptanceCriteria).toEqual(
        expect.arrayContaining([
          expect.stringContaining('gap'),
          expect.stringContaining('Review response time'),
        ]),
      );
    });

    it('includes code change requirement in acceptance criteria when applicable', async () => {
      const recommendation = createMockRecommendation();
      const task = await service.convertRecommendationToKiroTask(recommendation);

      expect(task.acceptanceCriteria).toEqual(
        expect.arrayContaining([
          expect.stringContaining('code changes pass'),
        ]),
      );
    });

    it('includes implementation steps in guidance', async () => {
      const recommendation = createMockRecommendation();
      const task = await service.convertRecommendationToKiroTask(recommendation);

      expect(task.implementationGuidance).toContain('Implement automated review response system');
      expect(task.implementationGuidance).toContain('Set up crash monitoring alerts');
      expect(task.implementationGuidance).toContain('code_change');
      expect(task.implementationGuidance).toContain('configuration');
    });

    it('includes risk assessment and rollback plan in guidance', async () => {
      const recommendation = createMockRecommendation();
      const task = await service.convertRecommendationToKiroTask(recommendation);

      expect(task.implementationGuidance).toContain('Risk Assessment');
      expect(task.implementationGuidance).toContain('medium');
      expect(task.implementationGuidance).toContain('Rollback Plan');
      expect(task.implementationGuidance).toContain('Disable automated responses');
    });

    it('includes verification steps', async () => {
      const recommendation = createMockRecommendation();
      const task = await service.convertRecommendationToKiroTask(recommendation);

      expect(task.verificationSteps).toEqual(
        expect.arrayContaining([
          expect.stringContaining('improved'),
          expect.stringContaining('test suite'),
          expect.stringContaining('12.5%'),
        ]),
      );
    });

    it('includes research references with source and domain', async () => {
      const recommendation = createMockRecommendation();
      const task = await service.convertRecommendationToKiroTask(recommendation);

      expect(task.researchReferences).toEqual(
        expect.arrayContaining([
          expect.stringContaining('industry-analysis'),
          expect.stringContaining('app-development'),
          expect.stringContaining('agent-zionx'),
        ]),
      );
    });

    it('publishes event on task creation', async () => {
      const recommendation = createMockRecommendation();
      await service.convertRecommendationToKiroTask(recommendation);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'kiro.task.created',
          detail: expect.objectContaining({
            recommendationId: 'rec-001',
            priority: 8,
          }),
        }),
      );
    });
  });
});

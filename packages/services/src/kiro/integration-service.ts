/**
 * Kiro Integration Service — generates and maintains Kiro steering files,
 * skill definitions, hook definitions, and task conversions from the
 * SeraphimOS SME architecture.
 *
 * Steering files encode each sub-agent's domain expertise for use during
 * Kiro development sessions. Hooks automate review cycles. Skills encapsulate
 * agent expertise. Tasks convert recommendations into actionable work items.
 *
 * Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6
 */

import { randomUUID } from 'node:crypto';
import type { EventBusService } from '@seraphim/core';
import type {
  DomainExpertiseProfile,
  DomainExpertiseProfileService,
} from '../sme/domain-expertise-profile.js';
import type { Recommendation } from '../sme/heartbeat-scheduler.js';
import type { TechnologyAssessment } from '../sme/industry-scanner.js';
import type { CapabilityMaturityScore } from '../sme/self-improvement-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SteeringFile {
  path: string;
  content: string;
  lastUpdated: Date;
  sourceAgentId: string;
  version: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  expertise: string[];
  activationTriggers: string[];
  content: string;
}

export interface HookDefinition {
  id: string;
  name: string;
  event: 'fileEdited' | 'fileCreated' | 'userTriggered' | 'promptSubmit';
  filePatterns?: string;
  action: 'askAgent' | 'runCommand';
  prompt?: string;
  command?: string;
}

export interface KiroTask {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  implementationGuidance: string;
  verificationSteps: string[];
  researchReferences: string[];
  priority: number;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface KiroIntegrationService {
  generateSteeringFile(agentId: string): Promise<SteeringFile>;
  generateMasterSteering(): Promise<SteeringFile>;
  updateSteeringFromExpertise(agentId: string): Promise<void>;
  updateSteeringFromIndustryScan(assessment: TechnologyAssessment): Promise<void>;
  generateSkillDefinition(agentId: string): Promise<SkillDefinition>;
  generateHookDefinitions(): Promise<HookDefinition[]>;
  convertRecommendationToKiroTask(recommendation: Recommendation): Promise<KiroTask>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface KiroIntegrationServiceConfig {
  tenantId: string;
  eventBus: EventBusService;
  profileService: DomainExpertiseProfileService;
  getCapabilityMaturity: () => Promise<CapabilityMaturityScore>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class KiroIntegrationServiceImpl implements KiroIntegrationService {
  private readonly tenantId: string;
  private readonly eventBus: EventBusService;
  private readonly profileService: DomainExpertiseProfileService;
  private readonly getCapabilityMaturity: () => Promise<CapabilityMaturityScore>;

  /** In-memory cache of generated steering files keyed by agentId */
  private readonly steeringCache: Map<string, SteeringFile> = new Map();

  constructor(config: KiroIntegrationServiceConfig) {
    this.tenantId = config.tenantId;
    this.eventBus = config.eventBus;
    this.profileService = config.profileService;
    this.getCapabilityMaturity = config.getCapabilityMaturity;
  }

  // -------------------------------------------------------------------------
  // Steering Files
  // -------------------------------------------------------------------------

  /**
   * Generate a Kiro steering file from a sub-agent's Domain Expertise Profile.
   * Follows the standard structure: domain overview, current state, decision
   * frameworks, best practices, quality standards, common pitfalls, tech stack,
   * research findings.
   *
   * Requirement 27.1
   */
  async generateSteeringFile(agentId: string): Promise<SteeringFile> {
    const domain = this.getDomainForAgent(agentId);
    const profile = await this.profileService.loadProfile(agentId, domain);

    const content = this.buildSteeringContent(profile);
    const version = `${profile.version}.0`;

    const steeringFile: SteeringFile = {
      path: `.kiro/steering/${domain}-expertise.md`,
      content,
      lastUpdated: new Date(),
      sourceAgentId: agentId,
      version,
    };

    this.steeringCache.set(agentId, steeringFile);

    await this.eventBus.publish({
      source: 'kiro-integration',
      type: 'kiro.steering.generated',
      detail: { agentId, domain, path: steeringFile.path, version },
      metadata: {
        tenantId: this.tenantId,
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });

    return steeringFile;
  }

  /**
   * Generate the master SeraphimOS steering file describing complete platform
   * architecture, conventions, operational procedures, and current capability maturity.
   *
   * Requirement 27.6
   */
  async generateMasterSteering(): Promise<SteeringFile> {
    const maturity = await this.getCapabilityMaturity();

    const sections: string[] = [];

    // Front-matter
    sections.push('---');
    sections.push('inclusion: auto');
    sections.push('---');
    sections.push('');

    // Platform Architecture
    sections.push('# SeraphimOS Platform Architecture');
    sections.push('');
    sections.push('## Overview');
    sections.push('');
    sections.push('SeraphimOS is an AI-powered autonomous orchestration platform coordinating a hierarchy');
    sections.push('of AI agents ("House of Zion") across multiple life and business pillars.');
    sections.push('');

    // Architecture
    sections.push('## Architecture');
    sections.push('');
    sections.push('- **Kernel (Seraphim Core)**: Agent runtime, state machine engine, permissions, IPC, resource allocation');
    sections.push('- **System Services**: Zikaron (memory), Mishmar (governance), Otzar (resources), Event Bus, XO Audit');
    sections.push('- **Application Layer**: ZionX (apps), ZXMG (media), Zion Alpha (trading), Eretz (business orchestration)');
    sections.push('- **Interface Layer (Shaar)**: Dashboard, API, CLI, Voice, Messaging');
    sections.push('- **Driver Layer**: External service adapters (App Store, YouTube, Kalshi, etc.)');
    sections.push('');

    // Conventions
    sections.push('## Conventions');
    sections.push('');
    sections.push('- TypeScript / Node.js on ECS Fargate');
    sections.push('- Event-driven architecture via EventBridge + SQS');
    sections.push('- 4-layer vector-backed memory (Zikaron): episodic, semantic, procedural, working');
    sections.push('- Declarative state machines with gate enforcement');
    sections.push('- Governance-as-code via Mishmar');
    sections.push('- All entities have completion contracts');
    sections.push('- Real data only — no mock data at any layer');
    sections.push('');

    // Operational Procedures
    sections.push('## Operational Procedures');
    sections.push('');
    sections.push('- Heartbeat reviews run on schedule per sub-agent for proactive domain research');
    sections.push('- Recommendations flow through the Recommendation Queue for King approval');
    sections.push('- Industry Scanner monitors external technology advances');
    sections.push('- Self-Improvement Engine proposes platform evolution');
    sections.push('- All actions logged via XO Audit for accountability');
    sections.push('');

    // Capability Maturity
    sections.push('## Capability Maturity');
    sections.push('');
    sections.push(`- **Overall Score**: ${maturity.overall}`);
    sections.push(`- **Target Vision**: ${maturity.targetVision}`);
    sections.push(`- **Estimated Time to Target**: ${maturity.estimatedTimeToTarget}`);
    sections.push('');
    sections.push('### By Domain');
    sections.push('');
    for (const [domain, score] of Object.entries(maturity.byDomain)) {
      sections.push(`- **${domain}**: ${score}`);
    }
    sections.push('');
    sections.push('### By Capability');
    sections.push('');
    for (const [capability, data] of Object.entries(maturity.byCapability)) {
      sections.push(`- **${capability}**: current=${data.current}, target=${data.target}, trend=${data.trend}`);
    }
    sections.push('');

    const content = sections.join('\n');

    const steeringFile: SteeringFile = {
      path: '.kiro/steering/seraphimos-master.md',
      content,
      lastUpdated: new Date(),
      sourceAgentId: 'seraphim-core',
      version: '1.0',
    };

    this.steeringCache.set('master', steeringFile);

    await this.eventBus.publish({
      source: 'kiro-integration',
      type: 'kiro.steering.master-generated',
      detail: { path: steeringFile.path },
      metadata: {
        tenantId: this.tenantId,
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });

    return steeringFile;
  }

  /**
   * Regenerate a domain steering file when the expertise profile is updated
   * (after heartbeat reviews or learning events).
   *
   * Requirement 27.1
   */
  async updateSteeringFromExpertise(agentId: string): Promise<void> {
    const steeringFile = await this.generateSteeringFile(agentId);

    await this.eventBus.publish({
      source: 'kiro-integration',
      type: 'kiro.steering.updated-from-expertise',
      detail: {
        agentId,
        path: steeringFile.path,
        version: steeringFile.version,
      },
      metadata: {
        tenantId: this.tenantId,
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });
  }

  /**
   * Update relevant steering files when the Industry Scanner detects new advances.
   *
   * Requirement 27.5
   */
  async updateSteeringFromIndustryScan(assessment: TechnologyAssessment): Promise<void> {
    for (const domain of assessment.relevantDomains) {
      const agentId = this.getAgentForDomain(domain);
      if (!agentId) continue;

      // Regenerate the steering file for the affected domain
      const steeringFile = await this.generateSteeringFile(agentId);

      await this.eventBus.publish({
        source: 'kiro-integration',
        type: 'kiro.steering.updated-from-industry-scan',
        detail: {
          agentId,
          domain,
          technologyName: assessment.technology.name,
          path: steeringFile.path,
          version: steeringFile.version,
        },
        metadata: {
          tenantId: this.tenantId,
          correlationId: randomUUID(),
          timestamp: new Date(),
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Skills
  // -------------------------------------------------------------------------

  /**
   * Generate a Kiro skill definition for a sub-agent domain encapsulating
   * the agent's expertise.
   *
   * Requirement 27.4
   */
  async generateSkillDefinition(agentId: string): Promise<SkillDefinition> {
    const domain = this.getDomainForAgent(agentId);
    const profile = await this.profileService.loadProfile(agentId, domain);

    const expertise = [
      ...profile.knowledgeBase.slice(0, 5).map((k) => k.topic),
      ...profile.industryBestPractices.slice(0, 3).map((bp) => bp.title),
    ];

    const activationTriggers = [
      `Working on ${domain} related code`,
      `Discussing ${domain} architecture`,
      `Reviewing ${domain} implementation`,
    ];

    const contentSections: string[] = [];
    contentSections.push(`# ${this.formatDomainName(domain)} SME Skill`);
    contentSections.push('');
    contentSections.push(`## Domain: ${domain}`);
    contentSections.push('');
    contentSections.push('## Expertise Areas');
    contentSections.push('');
    for (const item of expertise) {
      contentSections.push(`- ${item}`);
    }
    contentSections.push('');
    contentSections.push('## Decision Frameworks');
    contentSections.push('');
    for (const fw of profile.decisionFrameworks) {
      contentSections.push(`### ${fw.name}`);
      contentSections.push('');
      contentSections.push(fw.description);
      contentSections.push('');
      contentSections.push(`Inputs: ${fw.inputs.join(', ')}`);
      contentSections.push(`Historical Accuracy: ${(fw.historicalAccuracy * 100).toFixed(0)}%`);
      contentSections.push('');
    }
    contentSections.push('## Best Practices');
    contentSections.push('');
    for (const bp of profile.industryBestPractices) {
      contentSections.push(`- **${bp.title}**: ${bp.description}`);
    }
    contentSections.push('');
    contentSections.push('## Learned Patterns');
    contentSections.push('');
    for (const lp of profile.learnedPatterns.filter((p) => p.outcome === 'positive')) {
      contentSections.push(`- ✅ ${lp.pattern} (confidence: ${(lp.confidence * 100).toFixed(0)}%)`);
    }
    for (const lp of profile.learnedPatterns.filter((p) => p.outcome === 'negative')) {
      contentSections.push(`- ❌ ${lp.pattern} (confidence: ${(lp.confidence * 100).toFixed(0)}%)`);
    }
    contentSections.push('');

    const content = contentSections.join('\n');

    const skill: SkillDefinition = {
      name: `${domain}-sme`,
      description: `Subject Matter Expert skill for ${this.formatDomainName(domain)} domain. Provides domain expertise, decision frameworks, and best practices.`,
      expertise,
      activationTriggers,
      content,
    };

    await this.eventBus.publish({
      source: 'kiro-integration',
      type: 'kiro.skill.generated',
      detail: { agentId, domain, skillName: skill.name },
      metadata: {
        tenantId: this.tenantId,
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });

    return skill;
  }

  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------

  /**
   * Generate Kiro hook definitions for automated triggers:
   * - Code review (fileEdited)
   * - Recommendation processing (userTriggered)
   * - Heartbeat triggers (userTriggered)
   * - Industry scan review (userTriggered)
   * - Capability assessment (userTriggered)
   *
   * Requirement 27.2
   */
  async generateHookDefinitions(): Promise<HookDefinition[]> {
    const hooks: HookDefinition[] = [
      {
        id: 'sme-code-review',
        name: 'SME Code Review',
        event: 'fileEdited',
        filePatterns: '**/*.ts',
        action: 'askAgent',
        prompt: 'Review the edited code against domain expertise and best practices. Check for quality standards compliance, common pitfalls, and suggest improvements based on learned patterns.',
      },
      {
        id: 'recommendation-processor',
        name: 'Recommendation Processor',
        event: 'userTriggered',
        action: 'askAgent',
        prompt: 'Process pending recommendations from the Recommendation Queue. Present each recommendation with its world-class benchmark comparison, gap analysis, and action plan for King approval.',
      },
      {
        id: 'heartbeat-trigger',
        name: 'Heartbeat Review Trigger',
        event: 'userTriggered',
        action: 'askAgent',
        prompt: 'Trigger a heartbeat review cycle for the specified domain. Execute domain research, benchmark against world-class performance, perform gap analysis, and generate improvement recommendations.',
      },
      {
        id: 'industry-scan-review',
        name: 'Industry Scan Review',
        event: 'userTriggered',
        action: 'askAgent',
        prompt: 'Review the latest industry scan results and technology roadmap. Present new discoveries, their relevance assessments, and recommended adoption timelines.',
      },
      {
        id: 'capability-assessment',
        name: 'Capability Assessment',
        event: 'userTriggered',
        action: 'askAgent',
        prompt: 'Run a capability maturity assessment. Show overall and per-domain maturity scores, progress toward targets, identified gaps, and estimated time to full autonomous operation.',
      },
    ];

    await this.eventBus.publish({
      source: 'kiro-integration',
      type: 'kiro.hooks.generated',
      detail: { hookCount: hooks.length, hookIds: hooks.map((h) => h.id) },
      metadata: {
        tenantId: this.tenantId,
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });

    return hooks;
  }

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------

  /**
   * Convert an approved recommendation into a structured Kiro task with
   * acceptance criteria, implementation guidance, verification steps, and
   * research references.
   *
   * Requirement 27.3
   */
  async convertRecommendationToKiroTask(recommendation: Recommendation): Promise<KiroTask> {
    const acceptanceCriteria: string[] = [
      `${recommendation.gapAnalysis.description} is addressed`,
      ...recommendation.gapAnalysis.keyGaps.map(
        (gap) => `Gap resolved: ${gap}`,
      ),
    ];

    if (recommendation.actionPlan.requiresCodeChanges) {
      acceptanceCriteria.push('All code changes pass type checking and tests');
    }

    const implementationGuidance = [
      `## Summary`,
      '',
      recommendation.actionPlan.summary,
      '',
      `## Steps`,
      '',
      ...recommendation.actionPlan.steps.map(
        (step) => `${step.order}. [${step.type}] ${step.description} (est: ${step.estimatedDuration})`,
      ),
      '',
      `## Risk Assessment`,
      '',
      `Level: ${recommendation.riskAssessment.level}`,
      '',
      `Risks:`,
      ...recommendation.riskAssessment.risks.map((r) => `- ${r}`),
      '',
      `Mitigations:`,
      ...recommendation.riskAssessment.mitigations.map((m) => `- ${m}`),
      '',
      `## Rollback Plan`,
      '',
      recommendation.rollbackPlan,
    ].join('\n');

    const verificationSteps: string[] = [
      `Verify ${recommendation.currentState.description} has improved toward ${recommendation.worldClassBenchmark.description}`,
      'Run full test suite and confirm no regressions',
      `Confirm gap percentage reduced from ${recommendation.gapAnalysis.gapPercentage}%`,
    ];

    const researchReferences: string[] = [
      `World-class benchmark source: ${recommendation.worldClassBenchmark.source}`,
      `Domain: ${recommendation.domain}`,
      `Agent: ${recommendation.agentId}`,
    ];

    const task: KiroTask = {
      title: `[${recommendation.domain}] ${recommendation.actionPlan.summary}`,
      description: `Close the ${recommendation.gapAnalysis.gapPercentage}% gap identified in ${recommendation.domain}. ${recommendation.gapAnalysis.description}.`,
      acceptanceCriteria,
      implementationGuidance,
      verificationSteps,
      researchReferences,
      priority: recommendation.priority,
    };

    await this.eventBus.publish({
      source: 'kiro-integration',
      type: 'kiro.task.created',
      detail: {
        recommendationId: recommendation.id,
        taskTitle: task.title,
        priority: task.priority,
      },
      metadata: {
        tenantId: this.tenantId,
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    });

    return task;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private buildSteeringContent(profile: DomainExpertiseProfile): string {
    const sections: string[] = [];

    // Front-matter
    sections.push('---');
    sections.push('inclusion: manual');
    sections.push('---');
    sections.push('');

    // 1. Domain Overview
    sections.push(`# ${this.formatDomainName(profile.domain)} Domain Expertise`);
    sections.push('');
    sections.push('## Domain Overview');
    sections.push('');
    sections.push(`This steering file encodes the domain expertise for **${profile.domain}** (agent: ${profile.agentId}).`);
    sections.push(`Profile version: ${profile.version}. Last updated: ${profile.lastUpdated.toISOString()}.`);
    sections.push('');

    // World-class target from benchmarks
    if (profile.qualityBenchmarks.length > 0) {
      const topBenchmark = profile.qualityBenchmarks[0];
      sections.push(`**World-class target**: ${topBenchmark.metric} = ${topBenchmark.worldClass} ${topBenchmark.unit} (source: ${topBenchmark.source})`);
      sections.push('');
    }

    // 2. Current State
    sections.push('## Current State');
    sections.push('');
    if (profile.qualityBenchmarks.length > 0) {
      for (const qb of profile.qualityBenchmarks) {
        const pct = qb.worldClass > 0 ? ((qb.current / qb.worldClass) * 100).toFixed(0) : 'N/A';
        sections.push(`- **${qb.metric}**: ${qb.current} ${qb.unit} (${pct}% of world-class ${qb.worldClass} ${qb.unit})`);
      }
    } else {
      sections.push('No benchmarks configured yet.');
    }
    sections.push('');

    // 3. Decision Frameworks
    sections.push('## Decision Frameworks');
    sections.push('');
    if (profile.decisionFrameworks.length > 0) {
      for (const fw of profile.decisionFrameworks) {
        sections.push(`### ${fw.name}`);
        sections.push('');
        sections.push(fw.description);
        sections.push('');
        sections.push(`- **Inputs**: ${fw.inputs.join(', ')}`);
        sections.push(`- **Historical Accuracy**: ${(fw.historicalAccuracy * 100).toFixed(0)}%`);
        sections.push(`- **Last Calibrated**: ${fw.lastCalibrated.toISOString()}`);
        sections.push('');
      }
    } else {
      sections.push('No decision frameworks defined yet.');
      sections.push('');
    }

    // 4. Best Practices
    sections.push('## Best Practices');
    sections.push('');
    if (profile.industryBestPractices.length > 0) {
      for (const bp of profile.industryBestPractices) {
        sections.push(`- **${bp.title}**: ${bp.description} (confidence: ${(bp.confidence * 100).toFixed(0)}%)`);
      }
    } else {
      sections.push('No best practices recorded yet.');
    }
    sections.push('');

    // 5. Quality Standards
    sections.push('## Quality Standards');
    sections.push('');
    if (profile.qualityBenchmarks.length > 0) {
      sections.push('| Metric | Current | World-Class | Unit | Source |');
      sections.push('|--------|---------|-------------|------|--------|');
      for (const qb of profile.qualityBenchmarks) {
        sections.push(`| ${qb.metric} | ${qb.current} | ${qb.worldClass} | ${qb.unit} | ${qb.source} |`);
      }
    } else {
      sections.push('No quality standards defined yet.');
    }
    sections.push('');

    // 6. Common Pitfalls
    sections.push('## Common Pitfalls');
    sections.push('');
    const negativePats = profile.learnedPatterns.filter((p) => p.outcome === 'negative');
    if (negativePats.length > 0) {
      for (const lp of negativePats) {
        sections.push(`- ❌ **${lp.pattern}**: ${lp.context} (observed ${lp.occurrences} times, confidence: ${(lp.confidence * 100).toFixed(0)}%)`);
      }
    } else {
      sections.push('No common pitfalls identified yet.');
    }
    sections.push('');

    // 7. Technology Stack
    sections.push('## Technology Stack');
    sections.push('');
    const techKnowledge = profile.knowledgeBase.filter((k) =>
      k.tags.some((t) => ['technology', 'tool', 'framework', 'infrastructure'].includes(t)),
    );
    if (techKnowledge.length > 0) {
      for (const tk of techKnowledge) {
        sections.push(`- **${tk.topic}**: ${tk.content}`);
      }
    } else {
      sections.push('No technology stack entries recorded yet.');
    }
    sections.push('');

    // 8. Research Findings
    sections.push('## Research Findings');
    sections.push('');
    const recentKnowledge = profile.knowledgeBase
      .filter((k) => k.confidence >= 0.7)
      .slice(0, 10);
    if (recentKnowledge.length > 0) {
      for (const rk of recentKnowledge) {
        sections.push(`- **${rk.topic}**: ${rk.content} (source: ${rk.source}, confidence: ${(rk.confidence * 100).toFixed(0)}%)`);
      }
    } else {
      sections.push('No research findings available yet.');
    }
    sections.push('');

    return sections.join('\n');
  }

  private getDomainForAgent(agentId: string): string {
    const domainMap: Record<string, string> = {
      'agent-eretz': 'business-orchestration',
      'agent-zionx': 'app-development',
      'agent-zxmg': 'media-production',
      'agent-zion-alpha': 'prediction-markets',
      'agent-seraphim-core': 'ai-orchestration',
    };
    return domainMap[agentId] ?? 'general';
  }

  private getAgentForDomain(domain: string): string | null {
    const agentMap: Record<string, string> = {
      'business-orchestration': 'agent-eretz',
      'app-development': 'agent-zionx',
      'media-production': 'agent-zxmg',
      'prediction-markets': 'agent-zion-alpha',
      'ai-orchestration': 'agent-seraphim-core',
    };
    return agentMap[domain] ?? null;
  }

  private formatDomainName(domain: string): string {
    return domain
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

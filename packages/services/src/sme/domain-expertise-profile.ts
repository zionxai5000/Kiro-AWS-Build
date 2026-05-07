/**
 * Domain Expertise Profile — Storage and management for sub-agent domain knowledge.
 *
 * Each sub-agent maintains a structured, evolving knowledge base containing:
 * - Domain-specific research findings
 * - Competitive intelligence
 * - Decision frameworks
 * - Quality benchmarks
 * - Industry best practices
 * - Learned patterns from past execution
 *
 * Knowledge entries are stored in Zikaron semantic memory (vector-searchable).
 * Decision frameworks are stored in Zikaron procedural memory.
 *
 * Requirements: 23.1, 23.2, 23.7, 23.8
 */

import { randomUUID } from 'node:crypto';
import type { ZikaronService } from '@seraphim/core';
import type { SemanticEntry, ProceduralEntry, MemoryResult } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Domain Expertise Profile Types
// ---------------------------------------------------------------------------

export interface KnowledgeEntry {
  id: string;
  topic: string;
  content: string;
  source: string;
  confidence: number; // 0.0 - 1.0
  lastVerified: Date;
  tags: string[];
  contradicts?: string[]; // IDs of contradicting entries
}

export interface CompetitiveIntel {
  competitor: string;
  domain: string;
  metrics: Record<string, MetricValue>;
  strategies: string[];
  strengths: string[];
  weaknesses: string[];
  lastUpdated: Date;
}

export interface MetricValue {
  value: number;
  unit: string;
  benchmark?: number;
}

export interface DecisionFramework {
  name: string;
  description: string;
  inputs: string[];
  decisionTree: DecisionNode[];
  historicalAccuracy: number;
  lastCalibrated: Date;
}

export interface DecisionNode {
  condition: string;
  trueAction: string | DecisionNode;
  falseAction: string | DecisionNode;
}

export interface QualityBenchmark {
  metric: string;
  worldClass: number;
  current: number;
  unit: string;
  source: string;
  lastUpdated: Date;
}

export interface BestPractice {
  id: string;
  title: string;
  description: string;
  domain: string;
  source: string;
  confidence: number;
  tags: string[];
}

export interface LearnedPattern {
  id: string;
  pattern: string;
  context: string;
  outcome: 'positive' | 'negative' | 'neutral';
  confidence: number;
  occurrences: number;
  firstObserved: Date;
  lastObserved: Date;
}

export interface ResearchTopic {
  topic: string;
  priority: number;
  reason: string;
  addedAt: Date;
}

export interface ConflictEntry {
  entryId: string;
  conflictingEntryId: string;
  existingContent: string;
  newContent: string;
  existingConfidence: number;
  newConfidence: number;
  reason: string;
  resolvedAt?: Date;
  resolution?: 'kept_existing' | 'replaced' | 'merged' | 'unresolved';
}

export interface DomainExpertiseProfile {
  agentId: string;
  domain: string;
  version: number;
  lastUpdated: Date;

  // Core Knowledge
  knowledgeBase: KnowledgeEntry[];
  competitiveIntelligence: CompetitiveIntel[];
  decisionFrameworks: DecisionFramework[];
  qualityBenchmarks: QualityBenchmark[];
  industryBestPractices: BestPractice[];

  // Learned Patterns
  learnedPatterns: LearnedPattern[];

  // Research State
  lastResearchCycle: Date | null;
  researchBacklog: ResearchTopic[];
  knowledgeGaps: string[];

  // Conflicts
  conflicts: ConflictEntry[];
}

// ---------------------------------------------------------------------------
// Profile Service Configuration
// ---------------------------------------------------------------------------

export interface DomainExpertiseProfileServiceConfig {
  tenantId: string;
  zikaronService: ZikaronService;
}

// ---------------------------------------------------------------------------
// Seed Profile Input (used for createProfile)
// ---------------------------------------------------------------------------

export interface SeedProfileInput {
  agentId: string;
  domain: string;
  knowledgeEntries: Omit<KnowledgeEntry, 'id'>[];
  decisionFrameworks: DecisionFramework[];
  qualityBenchmarks: QualityBenchmark[];
  competitiveIntelligence?: CompetitiveIntel[];
  bestPractices?: Omit<BestPractice, 'id'>[];
  learnedPatterns?: Omit<LearnedPattern, 'id'>[];
  researchBacklog?: ResearchTopic[];
  knowledgeGaps?: string[];
}

// ---------------------------------------------------------------------------
// Update Input
// ---------------------------------------------------------------------------

export interface ProfileUpdateInput {
  knowledgeEntries?: Omit<KnowledgeEntry, 'id'>[];
  competitiveIntelligence?: CompetitiveIntel[];
  learnedPatterns?: Omit<LearnedPattern, 'id'>[];
  decisionFrameworks?: DecisionFramework[];
  qualityBenchmarks?: QualityBenchmark[];
  bestPractices?: Omit<BestPractice, 'id'>[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DomainExpertiseProfileService {
  private readonly tenantId: string;
  private readonly zikaron: ZikaronService;

  constructor(config: DomainExpertiseProfileServiceConfig) {
    this.tenantId = config.tenantId;
    this.zikaron = config.zikaronService;
  }

  /**
   * Create a new domain expertise profile for a sub-agent with seed knowledge.
   * Stores knowledge entries in Zikaron semantic memory and decision frameworks
   * in Zikaron procedural memory.
   *
   * Requirement 23.1: Maintain domain expertise profiles for each sub-agent
   */
  async createProfile(seed: SeedProfileInput): Promise<DomainExpertiseProfile> {
    const knowledgeBase: KnowledgeEntry[] = [];
    const bestPractices: BestPractice[] = [];
    const learnedPatterns: LearnedPattern[] = [];

    // Store knowledge entries in semantic memory
    for (const entry of seed.knowledgeEntries) {
      const id = randomUUID();
      const knowledgeEntry: KnowledgeEntry = { ...entry, id };

      await this.zikaron.storeSemantic({
        id,
        tenantId: this.tenantId,
        layer: 'semantic',
        content: `[${seed.domain}] ${entry.topic}: ${entry.content}`,
        embedding: [],
        sourceAgentId: seed.agentId,
        tags: ['domain-expertise', 'knowledge-entry', seed.domain, ...entry.tags],
        createdAt: new Date(),
        entityType: 'domain-knowledge',
        relationships: [],
        confidence: entry.confidence,
        source: 'manual',
      });

      knowledgeBase.push(knowledgeEntry);
    }

    // Store decision frameworks in procedural memory
    for (const framework of seed.decisionFrameworks) {
      await this.zikaron.storeProcedural({
        id: randomUUID(),
        tenantId: this.tenantId,
        layer: 'procedural',
        content: `[${seed.domain}] Framework: ${framework.name} — ${framework.description}`,
        embedding: [],
        sourceAgentId: seed.agentId,
        tags: ['domain-expertise', 'decision-framework', seed.domain],
        createdAt: new Date(),
        workflowPattern: `decision-framework:${framework.name}`,
        successRate: framework.historicalAccuracy,
        executionCount: 0,
        prerequisites: framework.inputs,
        steps: framework.decisionTree.map((node, i) => ({
          order: i + 1,
          action: 'evaluate',
          description: node.condition,
          expectedOutcome: typeof node.trueAction === 'string' ? node.trueAction : 'nested-decision',
        })),
      });
    }

    // Store best practices in semantic memory
    if (seed.bestPractices) {
      for (const practice of seed.bestPractices) {
        const id = randomUUID();
        bestPractices.push({ ...practice, id });

        await this.zikaron.storeSemantic({
          id,
          tenantId: this.tenantId,
          layer: 'semantic',
          content: `[${seed.domain}] Best Practice: ${practice.title} — ${practice.description}`,
          embedding: [],
          sourceAgentId: seed.agentId,
          tags: ['domain-expertise', 'best-practice', seed.domain, ...practice.tags],
          createdAt: new Date(),
          entityType: 'best-practice',
          relationships: [],
          confidence: practice.confidence,
          source: 'manual',
        });
      }
    }

    // Store learned patterns in semantic memory
    if (seed.learnedPatterns) {
      for (const pattern of seed.learnedPatterns) {
        const id = randomUUID();
        learnedPatterns.push({ ...pattern, id });

        await this.zikaron.storeSemantic({
          id,
          tenantId: this.tenantId,
          layer: 'semantic',
          content: `[${seed.domain}] Pattern: ${pattern.pattern} — ${pattern.context}`,
          embedding: [],
          sourceAgentId: seed.agentId,
          tags: ['domain-expertise', 'learned-pattern', seed.domain, pattern.outcome],
          createdAt: new Date(),
          entityType: 'learned-pattern',
          relationships: [],
          confidence: pattern.confidence,
          source: 'inferred',
        });
      }
    }

    const profile: DomainExpertiseProfile = {
      agentId: seed.agentId,
      domain: seed.domain,
      version: 1,
      lastUpdated: new Date(),
      knowledgeBase,
      competitiveIntelligence: seed.competitiveIntelligence ?? [],
      decisionFrameworks: seed.decisionFrameworks,
      qualityBenchmarks: seed.qualityBenchmarks,
      industryBestPractices: bestPractices,
      learnedPatterns,
      lastResearchCycle: null,
      researchBacklog: seed.researchBacklog ?? [],
      knowledgeGaps: seed.knowledgeGaps ?? [],
      conflicts: [],
    };

    return profile;
  }

  /**
   * Update an existing profile with new knowledge entries, competitive intelligence,
   * and learned patterns. Increments version and checks for conflicts.
   *
   * Requirement 23.7: Update domain expertise profile with new findings
   * Requirement 23.8: Propagate relevant cross-domain insights
   */
  async updateProfile(
    profile: DomainExpertiseProfile,
    update: ProfileUpdateInput,
  ): Promise<DomainExpertiseProfile> {
    const updatedProfile = { ...profile };
    updatedProfile.version = profile.version + 1;
    updatedProfile.lastUpdated = new Date();

    // Add new knowledge entries
    if (update.knowledgeEntries) {
      for (const entry of update.knowledgeEntries) {
        const id = randomUUID();
        const knowledgeEntry: KnowledgeEntry = { ...entry, id };

        // Check for conflicts with existing entries
        const conflicts = await this.detectConflicts(profile, entry);
        if (conflicts.length > 0) {
          knowledgeEntry.contradicts = conflicts.map((c) => c.entryId);
          for (const conflict of conflicts) {
            updatedProfile.conflicts.push(conflict);
          }
        }

        await this.zikaron.storeSemantic({
          id,
          tenantId: this.tenantId,
          layer: 'semantic',
          content: `[${profile.domain}] ${entry.topic}: ${entry.content}`,
          embedding: [],
          sourceAgentId: profile.agentId,
          tags: ['domain-expertise', 'knowledge-entry', profile.domain, ...entry.tags],
          createdAt: new Date(),
          entityType: 'domain-knowledge',
          relationships: [],
          confidence: entry.confidence,
          source: 'extracted',
        });

        updatedProfile.knowledgeBase = [...updatedProfile.knowledgeBase, knowledgeEntry];
      }
    }

    // Add competitive intelligence
    if (update.competitiveIntelligence) {
      updatedProfile.competitiveIntelligence = [
        ...updatedProfile.competitiveIntelligence,
        ...update.competitiveIntelligence,
      ];
    }

    // Add learned patterns
    if (update.learnedPatterns) {
      for (const pattern of update.learnedPatterns) {
        const id = randomUUID();
        updatedProfile.learnedPatterns = [
          ...updatedProfile.learnedPatterns,
          { ...pattern, id },
        ];

        await this.zikaron.storeSemantic({
          id,
          tenantId: this.tenantId,
          layer: 'semantic',
          content: `[${profile.domain}] Pattern: ${pattern.pattern} — ${pattern.context}`,
          embedding: [],
          sourceAgentId: profile.agentId,
          tags: ['domain-expertise', 'learned-pattern', profile.domain, pattern.outcome],
          createdAt: new Date(),
          entityType: 'learned-pattern',
          relationships: [],
          confidence: pattern.confidence,
          source: 'inferred',
        });
      }
    }

    // Add decision frameworks to procedural memory
    if (update.decisionFrameworks) {
      for (const framework of update.decisionFrameworks) {
        await this.zikaron.storeProcedural({
          id: randomUUID(),
          tenantId: this.tenantId,
          layer: 'procedural',
          content: `[${profile.domain}] Framework: ${framework.name} — ${framework.description}`,
          embedding: [],
          sourceAgentId: profile.agentId,
          tags: ['domain-expertise', 'decision-framework', profile.domain],
          createdAt: new Date(),
          workflowPattern: `decision-framework:${framework.name}`,
          successRate: framework.historicalAccuracy,
          executionCount: 0,
          prerequisites: framework.inputs,
          steps: framework.decisionTree.map((node, i) => ({
            order: i + 1,
            action: 'evaluate',
            description: node.condition,
            expectedOutcome: typeof node.trueAction === 'string' ? node.trueAction : 'nested-decision',
          })),
        });
      }
      updatedProfile.decisionFrameworks = [
        ...updatedProfile.decisionFrameworks,
        ...update.decisionFrameworks,
      ];
    }

    // Add quality benchmarks
    if (update.qualityBenchmarks) {
      updatedProfile.qualityBenchmarks = [
        ...updatedProfile.qualityBenchmarks,
        ...update.qualityBenchmarks,
      ];
    }

    // Add best practices
    if (update.bestPractices) {
      for (const practice of update.bestPractices) {
        const id = randomUUID();
        updatedProfile.industryBestPractices = [
          ...updatedProfile.industryBestPractices,
          { ...practice, id },
        ];

        await this.zikaron.storeSemantic({
          id,
          tenantId: this.tenantId,
          layer: 'semantic',
          content: `[${profile.domain}] Best Practice: ${practice.title} — ${practice.description}`,
          embedding: [],
          sourceAgentId: profile.agentId,
          tags: ['domain-expertise', 'best-practice', profile.domain, ...practice.tags],
          createdAt: new Date(),
          entityType: 'best-practice',
          relationships: [],
          confidence: practice.confidence,
          source: 'extracted',
        });
      }
    }

    return updatedProfile;
  }

  /**
   * Load the full expertise profile for an agent from Zikaron memory layers.
   * Knowledge entries come from semantic memory, decision frameworks from procedural memory.
   *
   * Requirement 23.2: Load agent's domain expertise profile into working context
   */
  async loadProfile(agentId: string, domain: string): Promise<DomainExpertiseProfile> {
    // Query semantic memory for knowledge entries
    const semanticResults = await this.zikaron.queryByAgent(
      agentId,
      `domain-expertise ${domain}`,
      ['semantic'],
    );

    // Query procedural memory for decision frameworks
    const proceduralResults = await this.zikaron.queryByAgent(
      agentId,
      `decision-framework ${domain}`,
      ['procedural'],
    );

    // Parse knowledge entries from semantic results
    const knowledgeBase: KnowledgeEntry[] = [];
    const competitiveIntelligence: CompetitiveIntel[] = [];
    const bestPractices: BestPractice[] = [];
    const learnedPatterns: LearnedPattern[] = [];

    for (const result of semanticResults) {
      const metadata = result.metadata as Record<string, unknown>;
      const entityType = metadata.entityType as string | undefined;

      if (entityType === 'domain-knowledge') {
        knowledgeBase.push({
          id: result.id,
          topic: this.extractTopic(result.content),
          content: this.extractContent(result.content),
          source: (metadata.source as string) ?? 'unknown',
          confidence: (metadata.confidence as number) ?? 0.5,
          lastVerified: result.timestamp,
          tags: (metadata.tags as string[]) ?? [],
          contradicts: (metadata.contradicts as string[]) ?? undefined,
        });
      } else if (entityType === 'best-practice') {
        bestPractices.push({
          id: result.id,
          title: this.extractTopic(result.content),
          description: this.extractContent(result.content),
          domain,
          source: (metadata.source as string) ?? 'unknown',
          confidence: (metadata.confidence as number) ?? 0.5,
          tags: (metadata.tags as string[]) ?? [],
        });
      } else if (entityType === 'learned-pattern') {
        learnedPatterns.push({
          id: result.id,
          pattern: this.extractTopic(result.content),
          context: this.extractContent(result.content),
          outcome: (metadata.outcome as 'positive' | 'negative' | 'neutral') ?? 'neutral',
          confidence: (metadata.confidence as number) ?? 0.5,
          occurrences: (metadata.occurrences as number) ?? 1,
          firstObserved: result.timestamp,
          lastObserved: result.timestamp,
        });
      }
    }

    // Parse decision frameworks from procedural results
    const decisionFrameworks: DecisionFramework[] = [];
    for (const result of proceduralResults) {
      const metadata = result.metadata as Record<string, unknown>;
      const workflowPattern = (metadata.workflowPattern as string) ?? '';

      if (workflowPattern.startsWith('decision-framework:')) {
        const name = workflowPattern.replace('decision-framework:', '');
        decisionFrameworks.push({
          name,
          description: this.extractContent(result.content),
          inputs: (metadata.prerequisites as string[]) ?? [],
          decisionTree: (metadata.decisionTree as DecisionNode[]) ?? [],
          historicalAccuracy: (metadata.successRate as number) ?? 0,
          lastCalibrated: result.timestamp,
        });
      }
    }

    return {
      agentId,
      domain,
      version: semanticResults.length + proceduralResults.length,
      lastUpdated: new Date(),
      knowledgeBase,
      competitiveIntelligence,
      decisionFrameworks,
      qualityBenchmarks: [],
      industryBestPractices: bestPractices,
      learnedPatterns,
      lastResearchCycle: null,
      researchBacklog: [],
      knowledgeGaps: [],
      conflicts: [],
    };
  }

  /**
   * Detect and flag conflicts when new research contradicts existing knowledge.
   * Presents both entries with confidence scores for resolution.
   *
   * Requirement 23.7: Flag entries that contradict existing knowledge for resolution
   */
  async resolveConflicts(
    profile: DomainExpertiseProfile,
    newEntry: Omit<KnowledgeEntry, 'id'>,
  ): Promise<ConflictEntry[]> {
    return this.detectConflicts(profile, newEntry);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private async detectConflicts(
    profile: DomainExpertiseProfile,
    newEntry: Omit<KnowledgeEntry, 'id'>,
  ): Promise<ConflictEntry[]> {
    const conflicts: ConflictEntry[] = [];

    // Search for existing entries on the same topic
    const existingOnTopic = profile.knowledgeBase.filter(
      (existing) =>
        existing.topic.toLowerCase() === newEntry.topic.toLowerCase() &&
        existing.content.toLowerCase() !== newEntry.content.toLowerCase(),
    );

    for (const existing of existingOnTopic) {
      // Flag the conflict in Zikaron
      const conflictingId = randomUUID();
      await this.zikaron.flagConflict(existing.id, conflictingId, {
        reason: `New research contradicts existing knowledge on topic: ${newEntry.topic}`,
        detectedBy: profile.agentId,
        detectedAt: new Date(),
      });

      conflicts.push({
        entryId: existing.id,
        conflictingEntryId: conflictingId,
        existingContent: existing.content,
        newContent: newEntry.content,
        existingConfidence: existing.confidence,
        newConfidence: newEntry.confidence,
        reason: `Contradicting information on topic: ${newEntry.topic}`,
      });
    }

    return conflicts;
  }

  private extractTopic(content: string): string {
    // Content format: "[domain] Topic: Content" or "[domain] Type: Title — Description"
    const match = content.match(/\[.*?\]\s*(?:.*?:\s*)?(.+?)(?:\s*—\s*|$)/);
    return match?.[1]?.trim() ?? content;
  }

  private extractContent(content: string): string {
    // Content format: "[domain] Topic: Content" or "[domain] Type: Title — Description"
    const match = content.match(/—\s*(.+)$/);
    return match?.[1]?.trim() ?? content;
  }
}

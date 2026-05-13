/**
 * ZionX Autonomous App Ideation Engine — App Idea Pipeline Manager
 *
 * Manages a ranked pipeline of app ideas from both autonomous research and
 * manual King input. Supports filtering, status transitions (pipeline →
 * generating → generated → published), dismiss/bookmark actions, and
 * automatic stale idea pruning.
 *
 * Requirements: 45c.8, 45c.9, 45c.10, 45c.11, 45d.12, 45d.13, 45d.14, 45d.15
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IdeaSource = 'autonomous' | 'manual';
export type IdeaStatus = 'pipeline' | 'generating' | 'generated' | 'published' | 'dismissed' | 'bookmarked';
export type CompetitionLevel = 'low' | 'medium' | 'high';

export interface AppIdea {
  id: string;
  name: string;
  valueProposition: string;
  targetAudience: string;
  monetizationModel: string;
  category: string;
  predictedDownloads: number;
  predictedRevenue: number;
  competitionLevel: CompetitionLevel;
  nicheScore: number;
  technicalFeasibility: number;
  source: IdeaSource;
  status: IdeaStatus;
  createdAt: Date;
  lastActionAt: Date;
  metadata: Record<string, unknown>;
}

export interface PipelineFilter {
  category?: string;
  minRevenue?: number;
  maxCompetition?: CompetitionLevel;
  minFeasibility?: number;
  status?: IdeaStatus;
}

export interface PipelineStats {
  total: number;
  byStatus: Record<IdeaStatus, number>;
  bySource: Record<IdeaSource, number>;
  averageScore: number;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces
// ---------------------------------------------------------------------------

export interface EventBusPublisher {
  publish(event: {
    source: string;
    type: string;
    detail: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PipelineManagerConfig {
  eventBus: EventBusPublisher;
  staleThresholdDays?: number;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface AppIdeaPipelineManager {
  addIdea(idea: Omit<AppIdea, 'id' | 'status' | 'createdAt' | 'lastActionAt'>): Promise<AppIdea>;
  rankPipeline(): AppIdea[];
  getPipeline(filter?: PipelineFilter): AppIdea[];
  refreshPipeline(newIdeas?: Omit<AppIdea, 'id' | 'status' | 'createdAt' | 'lastActionAt'>[]): Promise<void>;
  markAsGenerating(ideaId: string): Promise<AppIdea>;
  markAsGenerated(ideaId: string): Promise<AppIdea>;
  markAsPublished(ideaId: string): Promise<AppIdea>;
  dismissIdea(ideaId: string): Promise<AppIdea>;
  bookmarkIdea(ideaId: string): Promise<AppIdea>;
  getStats(): PipelineStats;
}

// ---------------------------------------------------------------------------
// Competition Level Ordering
// ---------------------------------------------------------------------------

const COMPETITION_ORDER: Record<CompetitionLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class AppIdeaPipelineManagerImpl implements AppIdeaPipelineManager {
  private readonly eventBus: EventBusPublisher;
  private readonly staleThresholdDays: number;
  private readonly ideas = new Map<string, AppIdea>();

  constructor(config: PipelineManagerConfig) {
    this.eventBus = config.eventBus;
    this.staleThresholdDays = config.staleThresholdDays ?? 30;
  }

  /**
   * Add ideas from both autonomous and manual sources with correct metadata.
   * Requirement 45c.8, 45d.14
   */
  async addIdea(input: Omit<AppIdea, 'id' | 'status' | 'createdAt' | 'lastActionAt'>): Promise<AppIdea> {
    const now = new Date();
    const idea: AppIdea = {
      ...input,
      id: randomUUID(),
      status: 'pipeline',
      createdAt: now,
      lastActionAt: now,
    };

    this.ideas.set(idea.id, idea);

    // Emit app.idea.ranked hook (Requirement 45c.10)
    await this.eventBus.publish({
      source: 'zionx.ideation',
      type: 'app.idea.ranked',
      detail: {
        ideaId: idea.id,
        name: idea.name,
        source: idea.source,
        nicheScore: idea.nicheScore,
        action: 'added',
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: idea.id,
        timestamp: now,
      },
    });

    // Emit app.pipeline.updated hook (Requirement 45d.15)
    await this.emitPipelineUpdated('idea_added', idea.id);

    return idea;
  }

  /**
   * Sort ideas by composite score of predicted downloads, revenue, and inverse competition.
   * Requirement 45c.9
   */
  rankPipeline(): AppIdea[] {
    const activeIdeas = Array.from(this.ideas.values()).filter(
      (idea) => idea.status === 'pipeline' || idea.status === 'bookmarked',
    );

    return activeIdeas.sort((a, b) => {
      const scoreA = this.computeRankingScore(a);
      const scoreB = this.computeRankingScore(b);
      return scoreB - scoreA;
    });
  }

  /**
   * Return ranked ideas with optional filters.
   * Requirement 45c.9
   */
  getPipeline(filter?: PipelineFilter): AppIdea[] {
    let ideas = this.rankPipeline();

    if (!filter) return ideas;

    if (filter.category) {
      ideas = ideas.filter((i) => i.category === filter.category);
    }
    if (filter.minRevenue !== undefined) {
      ideas = ideas.filter((i) => i.predictedRevenue >= filter.minRevenue!);
    }
    if (filter.maxCompetition) {
      const maxOrder = COMPETITION_ORDER[filter.maxCompetition];
      ideas = ideas.filter((i) => COMPETITION_ORDER[i.competitionLevel] <= maxOrder);
    }
    if (filter.minFeasibility !== undefined) {
      ideas = ideas.filter((i) => i.technicalFeasibility >= filter.minFeasibility!);
    }
    if (filter.status) {
      ideas = ideas.filter((i) => i.status === filter.status);
    }

    return ideas;
  }

  /**
   * Re-score existing ideas, remove stale ideas (>30 days without action),
   * add new ideas from research.
   * Requirement 45c.11
   */
  async refreshPipeline(newIdeas?: Omit<AppIdea, 'id' | 'status' | 'createdAt' | 'lastActionAt'>[]): Promise<void> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - this.staleThresholdDays * 24 * 60 * 60 * 1000);

    // Remove stale ideas
    const staleIds: string[] = [];
    for (const [id, idea] of this.ideas.entries()) {
      if (idea.status === 'pipeline' && idea.lastActionAt < staleThreshold) {
        staleIds.push(id);
      }
    }
    for (const id of staleIds) {
      this.ideas.delete(id);
    }

    // Add new ideas from research
    if (newIdeas) {
      for (const input of newIdeas) {
        await this.addIdea(input);
      }
    }

    // Emit re-rank hook
    if (staleIds.length > 0 || (newIdeas && newIdeas.length > 0)) {
      await this.eventBus.publish({
        source: 'zionx.ideation',
        type: 'app.idea.ranked',
        detail: {
          action: 're-ranked',
          stalePruned: staleIds.length,
          newAdded: newIdeas?.length ?? 0,
          totalPipeline: this.ideas.size,
        },
        metadata: {
          tenantId: 'house-of-zion',
          correlationId: randomUUID(),
          timestamp: now,
        },
      });

      await this.emitPipelineUpdated('refreshed', undefined);
    }
  }

  /**
   * Gate 1: Mark idea as generating (King clicks "Generate").
   * Requirement 45d.12
   */
  async markAsGenerating(ideaId: string): Promise<AppIdea> {
    return this.transitionStatus(ideaId, 'generating');
  }

  /**
   * Mark idea as generated (app generation complete).
   * Requirement 45d.12
   */
  async markAsGenerated(ideaId: string): Promise<AppIdea> {
    return this.transitionStatus(ideaId, 'generated');
  }

  /**
   * Gate 2: Mark idea as published (King clicks "Publish").
   * Requirement 45d.13
   */
  async markAsPublished(ideaId: string): Promise<AppIdea> {
    return this.transitionStatus(ideaId, 'published');
  }

  /**
   * King dismisses an idea from the pipeline.
   * Requirement 45e.18
   */
  async dismissIdea(ideaId: string): Promise<AppIdea> {
    return this.transitionStatus(ideaId, 'dismissed');
  }

  /**
   * King bookmarks an idea for later consideration.
   * Requirement 45e.18
   */
  async bookmarkIdea(ideaId: string): Promise<AppIdea> {
    return this.transitionStatus(ideaId, 'bookmarked');
  }

  /**
   * Get pipeline statistics.
   */
  getStats(): PipelineStats {
    const allIdeas = Array.from(this.ideas.values());
    const byStatus: Record<IdeaStatus, number> = {
      pipeline: 0,
      generating: 0,
      generated: 0,
      published: 0,
      dismissed: 0,
      bookmarked: 0,
    };
    const bySource: Record<IdeaSource, number> = {
      autonomous: 0,
      manual: 0,
    };

    let totalScore = 0;
    for (const idea of allIdeas) {
      byStatus[idea.status]++;
      bySource[idea.source]++;
      totalScore += idea.nicheScore;
    }

    return {
      total: allIdeas.length,
      byStatus,
      bySource,
      averageScore: allIdeas.length > 0 ? totalScore / allIdeas.length : 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private computeRankingScore(idea: AppIdea): number {
    const downloadScore = Math.min(idea.predictedDownloads / 100000, 1) * 40;
    const revenueScore = Math.min(idea.predictedRevenue / 10000, 1) * 40;
    const competitionScore = (1 - (COMPETITION_ORDER[idea.competitionLevel] - 1) / 2) * 20;
    return downloadScore + revenueScore + competitionScore;
  }

  private async transitionStatus(ideaId: string, newStatus: IdeaStatus): Promise<AppIdea> {
    const idea = this.ideas.get(ideaId);
    if (!idea) {
      throw new Error(`Idea not found: ${ideaId}`);
    }

    const previousStatus = idea.status;
    idea.status = newStatus;
    idea.lastActionAt = new Date();

    await this.emitPipelineUpdated(`status_changed:${previousStatus}->${newStatus}`, ideaId);

    return idea;
  }

  private async emitPipelineUpdated(action: string, ideaId: string | undefined): Promise<void> {
    await this.eventBus.publish({
      source: 'zionx.ideation',
      type: 'app.pipeline.updated',
      detail: {
        action,
        ideaId,
        pipelineSize: this.ideas.size,
      },
      metadata: {
        tenantId: 'house-of-zion',
        correlationId: ideaId ?? randomUUID(),
        timestamp: new Date(),
      },
    });
  }
}

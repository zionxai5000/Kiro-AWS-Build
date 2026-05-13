/**
 * ZXMG Video Development Studio — Autonomous Content Engine
 *
 * Default operating mode of ZXMG_Video_Studio. Autonomously researches trending
 * topics, generates content calendars, ranks ideas by predicted performance,
 * maintains rolling pipelines per channel, and provides human-gated generation
 * and publishing. The King clicks "Generate" to trigger production and "Publish"
 * to push live — everything else is autonomous.
 *
 * Requirements: 44a.1, 44a.2, 44a.3, 44a.4, 44a.5, 44a.6, 44f.35, 44f.36
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineItemStatus =
  | 'ideated'
  | 'approved'
  | 'generating'
  | 'generated'
  | 'editing'
  | 'ready_to_publish'
  | 'publishing'
  | 'published'
  | 'rejected';

export interface PipelineItemConcept {
  title: string;
  description: string;
  predictedViews: number;
  predictedEngagement: number;
  predictedRevenue: number;
  suggestedPublishDate: Date;
  style: string;
  duration: number; // seconds
  tags: string[];
}

export interface PipelineItem {
  id: string;
  channelId: string;
  status: PipelineItemStatus;
  concept: PipelineItemConcept;
  script?: string;
  generatedVideoUrl?: string;
  thumbnailVariants?: string[];
  metadata?: { title: string; description: string; tags: string[] };
  createdAt: Date;
  generatedAt?: Date;
  publishedAt?: Date;
  feedback?: string[];
}

// ---------------------------------------------------------------------------
// Hook Types
// ---------------------------------------------------------------------------

export type VideoHookName =
  | 'video.idea.generated'
  | 'video.pipeline.updated';

export interface VideoHookPayload {
  channelId: string;
  timestamp: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface TrendResearchProvider {
  getTopics(channelNiche: string): Promise<Array<{
    topic: string;
    velocity: number;
    relevanceScore: number;
    searchVolume: number;
  }>>;
}

export interface ZikaronPerformanceStore {
  getPerformancePatterns(channelId: string): Promise<Array<{
    style: string;
    avgViews: number;
    avgEngagement: number;
    avgRevenue: number;
    avgDuration: number;
  }>>;
}

export interface VideoEventBus {
  publish(event: {
    source: string;
    type: string;
    detail: Record<string, unknown>;
  }): Promise<void>;
}

export interface VideoPublisher {
  upload(channelId: string, videoUrl: string, metadata: {
    title: string;
    description: string;
    tags: string[];
    thumbnailUrl?: string;
    scheduledAt?: Date;
  }): Promise<{ publishedUrl: string }>;
}

export interface VideoGenerator {
  generate(concept: PipelineItemConcept, channelId: string): Promise<{
    videoUrl: string;
    thumbnailVariants: string[];
    metadata: { title: string; description: string; tags: string[] };
  }>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface AutonomousContentEngine {
  // Ideation (autonomous)
  generateIdeas(channelId: string, channelNiche: string, count?: number): Promise<PipelineItem[]>;

  // Pipeline management (per channel)
  getPipeline(channelId: string): Promise<PipelineItem[]>;
  getPipelineItem(itemId: string): Promise<PipelineItem | null>;

  // Human gates
  triggerGeneration(itemId: string): Promise<PipelineItem>; // King clicks "Generate"
  triggerPublish(itemId: string): Promise<PipelineItem>;    // King clicks "Publish"

  // Edit feedback
  provideFeedback(itemId: string, feedback: string): Promise<PipelineItem>;
  markReadyToPublish(itemId: string): Promise<PipelineItem>;

  // King overrides
  rejectItem(itemId: string, reason: string): Promise<void>;
  modifyItem(itemId: string, updates: Partial<PipelineItemConcept>): Promise<PipelineItem>;
  reorderPipeline(channelId: string, itemIds: string[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

const MIN_PIPELINE_DAYS = 7;
const MAX_PIPELINE_DAYS = 14;
const DEFAULT_IDEA_COUNT = 10;

/**
 * Default implementation of AutonomousContentEngine.
 *
 * Uses dependency injection for trend research, Zikaron performance data,
 * event bus, video generation, and publishing. Maintains an in-memory pipeline
 * store scoped by channel.
 */
export class DefaultAutonomousContentEngine implements AutonomousContentEngine {
  private static readonly EVENT_SOURCE = 'zxmg.studio.autonomous';

  /** In-memory pipeline storage: channelId → PipelineItem[] */
  private readonly pipelines = new Map<string, PipelineItem[]>();

  /** Global item index for fast lookup by id */
  private readonly itemIndex = new Map<string, PipelineItem>();

  private idCounter = 0;

  constructor(
    private readonly trendResearch: TrendResearchProvider,
    private readonly performanceStore: ZikaronPerformanceStore,
    private readonly eventBus: VideoEventBus,
    private readonly videoGenerator: VideoGenerator,
    private readonly videoPublisher: VideoPublisher,
  ) {}

  // -------------------------------------------------------------------------
  // Ideation (autonomous)
  // -------------------------------------------------------------------------

  /**
   * Autonomously generates ranked content ideas for a channel by combining
   * trend research results with Zikaron performance patterns.
   *
   * Requirements: 44a.1, 44a.2, 44a.3
   */
  async generateIdeas(
    channelId: string,
    channelNiche: string,
    count: number = DEFAULT_IDEA_COUNT,
  ): Promise<PipelineItem[]> {
    // Fetch trend data and historical performance patterns
    const [topics, patterns] = await Promise.all([
      this.trendResearch.getTopics(channelNiche),
      this.performanceStore.getPerformancePatterns(channelId),
    ]);

    // Generate ideas from trending topics, enriched with performance data
    const ideas: PipelineItem[] = [];
    const topTopics = topics.slice(0, count);

    for (let i = 0; i < topTopics.length; i++) {
      const topic = topTopics[i];
      const bestPattern = this.findBestPattern(patterns, topic);

      const suggestedPublishDate = new Date();
      suggestedPublishDate.setDate(
        suggestedPublishDate.getDate() + MIN_PIPELINE_DAYS + i,
      );

      const item: PipelineItem = {
        id: this.generateId(),
        channelId,
        status: 'ideated',
        concept: {
          title: topic.topic,
          description: `Trending content about "${topic.topic}" — velocity ${topic.velocity}/100, relevance ${topic.relevanceScore}/100`,
          predictedViews: this.predictViews(topic, bestPattern),
          predictedEngagement: this.predictEngagement(topic, bestPattern),
          predictedRevenue: this.predictRevenue(topic, bestPattern),
          suggestedPublishDate,
          style: bestPattern?.style ?? 'cinematic',
          duration: bestPattern?.avgDuration ?? 600,
          tags: [channelNiche, topic.topic.toLowerCase().replace(/\s+/g, '-')],
        },
        createdAt: new Date(),
      };

      ideas.push(item);
    }

    // Rank by composite score: predicted views + engagement + revenue
    ideas.sort((a, b) => this.calculateRankScore(b) - this.calculateRankScore(a));

    // Ensure pipeline stays within 7-14 day window
    const trimmedIdeas = this.trimToPipelineWindow(ideas);

    // Store in pipeline
    const channelPipeline = this.getOrCreatePipeline(channelId);
    for (const idea of trimmedIdeas) {
      channelPipeline.push(idea);
      this.itemIndex.set(idea.id, idea);
    }

    // Emit hooks for each generated idea
    for (const idea of trimmedIdeas) {
      await this.emitHook('video.idea.generated', {
        channelId,
        itemId: idea.id,
        title: idea.concept.title,
        predictedViews: idea.concept.predictedViews,
        predictedEngagement: idea.concept.predictedEngagement,
        predictedRevenue: idea.concept.predictedRevenue,
      });
    }

    return trimmedIdeas;
  }

  // -------------------------------------------------------------------------
  // Pipeline management (per channel)
  // -------------------------------------------------------------------------

  /**
   * Returns the pipeline for a specific channel, scoped to that channel only.
   *
   * Requirements: 44f.35, 44f.36
   */
  async getPipeline(channelId: string): Promise<PipelineItem[]> {
    return this.getOrCreatePipeline(channelId);
  }

  /**
   * Returns a single pipeline item by ID, or null if not found.
   */
  async getPipelineItem(itemId: string): Promise<PipelineItem | null> {
    return this.itemIndex.get(itemId) ?? null;
  }

  // -------------------------------------------------------------------------
  // Human gates
  // -------------------------------------------------------------------------

  /**
   * King clicks "Generate" — triggers full production pipeline for the item.
   * Transitions: ideated|approved → generating → generated
   *
   * Requirement: 44a.4
   */
  async triggerGeneration(itemId: string): Promise<PipelineItem> {
    const item = this.getItemOrThrow(itemId);

    if (item.status !== 'ideated' && item.status !== 'approved') {
      throw new Error(
        `Cannot generate item in status "${item.status}". Must be "ideated" or "approved".`,
      );
    }

    // Transition to generating
    item.status = 'generating';
    await this.emitPipelineUpdated(item.channelId, itemId, 'generating');

    // Execute video generation
    const result = await this.videoGenerator.generate(item.concept, item.channelId);

    // Transition to generated
    item.status = 'generated';
    item.generatedVideoUrl = result.videoUrl;
    item.thumbnailVariants = result.thumbnailVariants;
    item.metadata = result.metadata;
    item.generatedAt = new Date();

    await this.emitPipelineUpdated(item.channelId, itemId, 'generated');

    return item;
  }

  /**
   * King clicks "Publish" — uploads the video to the assigned channel.
   * Transitions: ready_to_publish → publishing → published
   *
   * Requirement: 44a.5
   */
  async triggerPublish(itemId: string): Promise<PipelineItem> {
    const item = this.getItemOrThrow(itemId);

    if (item.status !== 'ready_to_publish') {
      throw new Error(
        `Cannot publish item in status "${item.status}". Must be "ready_to_publish".`,
      );
    }

    if (!item.generatedVideoUrl || !item.metadata) {
      throw new Error('Cannot publish item without generated video and metadata.');
    }

    // Transition to publishing
    item.status = 'publishing';
    await this.emitPipelineUpdated(item.channelId, itemId, 'publishing');

    // Upload to platform
    await this.videoPublisher.upload(item.channelId, item.generatedVideoUrl, {
      title: item.metadata.title,
      description: item.metadata.description,
      tags: item.metadata.tags,
      thumbnailUrl: item.thumbnailVariants?.[0],
      scheduledAt: item.concept.suggestedPublishDate,
    });

    // Transition to published
    item.status = 'published';
    item.publishedAt = new Date();

    await this.emitPipelineUpdated(item.channelId, itemId, 'published');

    return item;
  }

  // -------------------------------------------------------------------------
  // Edit feedback
  // -------------------------------------------------------------------------

  /**
   * King provides natural language feedback on a generated video.
   * Transitions: generated → editing
   *
   * Requirement: 44a.9 (edit feedback loop)
   */
  async provideFeedback(itemId: string, feedback: string): Promise<PipelineItem> {
    const item = this.getItemOrThrow(itemId);

    if (item.status !== 'generated' && item.status !== 'editing') {
      throw new Error(
        `Cannot provide feedback for item in status "${item.status}". Must be "generated" or "editing".`,
      );
    }

    item.status = 'editing';
    if (!item.feedback) {
      item.feedback = [];
    }
    item.feedback.push(feedback);

    await this.emitPipelineUpdated(item.channelId, itemId, 'editing');

    return item;
  }

  /**
   * King marks a video as ready to publish after reviewing.
   * Transitions: generated|editing → ready_to_publish
   */
  async markReadyToPublish(itemId: string): Promise<PipelineItem> {
    const item = this.getItemOrThrow(itemId);

    if (item.status !== 'generated' && item.status !== 'editing') {
      throw new Error(
        `Cannot mark item as ready to publish in status "${item.status}". Must be "generated" or "editing".`,
      );
    }

    item.status = 'ready_to_publish';
    await this.emitPipelineUpdated(item.channelId, itemId, 'ready_to_publish');

    return item;
  }

  // -------------------------------------------------------------------------
  // King overrides
  // -------------------------------------------------------------------------

  /**
   * King rejects a pipeline item — removes it from active pipeline.
   *
   * Requirement: 44a.6
   */
  async rejectItem(itemId: string, reason: string): Promise<void> {
    const item = this.getItemOrThrow(itemId);

    item.status = 'rejected';

    await this.emitPipelineUpdated(item.channelId, itemId, 'rejected', { reason });
  }

  /**
   * King modifies a pipeline item's concept — updates and recalculates schedule.
   *
   * Requirement: 44a.6
   */
  async modifyItem(
    itemId: string,
    updates: Partial<PipelineItemConcept>,
  ): Promise<PipelineItem> {
    const item = this.getItemOrThrow(itemId);

    // Apply updates to concept
    item.concept = { ...item.concept, ...updates };

    // Recalculate schedule if publish date not explicitly set
    if (!updates.suggestedPublishDate) {
      item.concept.suggestedPublishDate = this.recalculatePublishDate(item);
    }

    await this.emitPipelineUpdated(item.channelId, itemId, item.status, {
      modifications: Object.keys(updates),
    });

    return item;
  }

  /**
   * King reorders pipeline items for a channel.
   *
   * Requirement: 44f.35 (channel-scoped operations)
   */
  async reorderPipeline(channelId: string, itemIds: string[]): Promise<void> {
    const pipeline = this.getOrCreatePipeline(channelId);

    // Validate all IDs belong to this channel
    for (const id of itemIds) {
      const item = this.itemIndex.get(id);
      if (!item || item.channelId !== channelId) {
        throw new Error(`Item "${id}" not found in channel "${channelId}" pipeline.`);
      }
    }

    // Reorder: place specified items first in given order, then remaining items
    const reordered: PipelineItem[] = [];
    for (const id of itemIds) {
      const item = this.itemIndex.get(id)!;
      reordered.push(item);
    }

    // Add any items not in the reorder list at the end
    for (const item of pipeline) {
      if (!itemIds.includes(item.id)) {
        reordered.push(item);
      }
    }

    // Replace pipeline contents
    pipeline.length = 0;
    pipeline.push(...reordered);

    await this.emitPipelineUpdated(channelId, '', 'ideated', {
      action: 'reorder',
      newOrder: itemIds,
    });
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private getOrCreatePipeline(channelId: string): PipelineItem[] {
    let pipeline = this.pipelines.get(channelId);
    if (!pipeline) {
      pipeline = [];
      this.pipelines.set(channelId, pipeline);
    }
    return pipeline;
  }

  private getItemOrThrow(itemId: string): PipelineItem {
    const item = this.itemIndex.get(itemId);
    if (!item) {
      throw new Error(`Pipeline item "${itemId}" not found.`);
    }
    return item;
  }

  private generateId(): string {
    this.idCounter++;
    return `idea-${Date.now()}-${this.idCounter}`;
  }

  private findBestPattern(
    patterns: Array<{ style: string; avgViews: number; avgEngagement: number; avgRevenue: number; avgDuration: number }>,
    topic: { velocity: number; relevanceScore: number },
  ): { style: string; avgViews: number; avgEngagement: number; avgRevenue: number; avgDuration: number } | null {
    if (patterns.length === 0) return null;

    // Pick the pattern with highest combined performance
    return patterns.reduce((best, current) => {
      const bestScore = best.avgViews + best.avgEngagement * 1000 + best.avgRevenue;
      const currentScore = current.avgViews + current.avgEngagement * 1000 + current.avgRevenue;
      return currentScore > bestScore ? current : best;
    });
  }

  private predictViews(
    topic: { velocity: number; relevanceScore: number; searchVolume: number },
    pattern: { avgViews: number } | null,
  ): number {
    const baseViews = pattern?.avgViews ?? 10000;
    const velocityMultiplier = 1 + (topic.velocity / 100);
    const relevanceMultiplier = 1 + (topic.relevanceScore / 200);
    return Math.round(baseViews * velocityMultiplier * relevanceMultiplier);
  }

  private predictEngagement(
    topic: { velocity: number; relevanceScore: number },
    pattern: { avgEngagement: number } | null,
  ): number {
    const baseEngagement = pattern?.avgEngagement ?? 5.0;
    const relevanceBoost = topic.relevanceScore / 200;
    return Math.round((baseEngagement + relevanceBoost) * 100) / 100;
  }

  private predictRevenue(
    topic: { velocity: number; searchVolume: number },
    pattern: { avgRevenue: number } | null,
  ): number {
    const baseRevenue = pattern?.avgRevenue ?? 50;
    const volumeMultiplier = 1 + (topic.searchVolume / 10000);
    return Math.round(baseRevenue * volumeMultiplier * 100) / 100;
  }

  private calculateRankScore(item: PipelineItem): number {
    // Composite score: normalized views + engagement + revenue
    const viewScore = item.concept.predictedViews / 100000;
    const engagementScore = item.concept.predictedEngagement * 10;
    const revenueScore = item.concept.predictedRevenue / 10;
    return viewScore + engagementScore + revenueScore;
  }

  private trimToPipelineWindow(ideas: PipelineItem[]): PipelineItem[] {
    const now = new Date();
    const maxDate = new Date();
    maxDate.setDate(now.getDate() + MAX_PIPELINE_DAYS);

    return ideas.filter(
      (idea) => idea.concept.suggestedPublishDate <= maxDate,
    );
  }

  private recalculatePublishDate(item: PipelineItem): Date {
    // Find the item's position in its channel pipeline and space evenly
    const pipeline = this.getOrCreatePipeline(item.channelId);
    const activeItems = pipeline.filter(
      (i) => i.status !== 'rejected' && i.status !== 'published',
    );
    const index = activeItems.findIndex((i) => i.id === item.id);

    const newDate = new Date();
    newDate.setDate(newDate.getDate() + MIN_PIPELINE_DAYS + Math.max(0, index));
    return newDate;
  }

  private async emitHook(
    hookName: VideoHookName,
    payload: VideoHookPayload,
  ): Promise<void> {
    await this.eventBus.publish({
      source: DefaultAutonomousContentEngine.EVENT_SOURCE,
      type: hookName,
      detail: { ...payload, timestamp: payload.timestamp || Date.now() },
    });
  }

  private async emitPipelineUpdated(
    channelId: string,
    itemId: string,
    newStatus: PipelineItemStatus | string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.emitHook('video.pipeline.updated', {
      channelId,
      timestamp: Date.now(),
      itemId,
      newStatus,
      ...extra,
    });
  }
}

/**
 * ZXMG Video Development Studio — Platform Distribution Engine
 *
 * Handles multi-platform publishing, scheduling, optimal timing calculation,
 * and content repurposing (long-form to shorts/clips). Supports YouTube,
 * TikTok, Instagram, X, Facebook, and Rumble with platform-specific configs.
 *
 * Requirements: 44c.17, 44c.18, 44c.19, 44c.20
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DistributionPlatform = 'youtube' | 'tiktok' | 'instagram' | 'x' | 'facebook' | 'rumble';

export interface DistributionConfig {
  platform: DistributionPlatform;
  aspectRatio: string;
  maxDuration: number; // seconds
  captionFormat: string;
  hashtagConvention: string;
}

export interface PublishRequest {
  videoUrl: string;
  channelId: string;
  platforms: DistributionPlatform[];
  metadata: { title: string; description: string; tags: string[] };
  thumbnailUrl?: string;
  scheduledAt?: Date;
}

export interface PublishResult {
  platform: DistributionPlatform;
  success: boolean;
  publishedUrl?: string;
  error?: string;
}

export interface ScheduleEntry {
  scheduledId: string;
  scheduledAt: Date;
}

export interface RepurposedContent {
  format: string;
  videoUrl: string;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface PlatformPublisher {
  publish(
    platform: DistributionPlatform,
    videoUrl: string,
    metadata: { title: string; description: string; tags: string[] },
    thumbnailUrl?: string,
  ): Promise<PublishResult>;
}

export interface ScheduleStore {
  save(entry: { scheduledId: string; request: PublishRequest; scheduledAt: Date }): Promise<void>;
  get(scheduledId: string): Promise<{ scheduledId: string; request: PublishRequest; scheduledAt: Date } | null>;
}

export interface AudienceAnalyzer {
  getOptimalPostTime(channelId: string, platform: DistributionPlatform): Promise<Date>;
}

export interface VideoRepurposer {
  repurpose(videoUrl: string, fromFormat: string, toFormat: string): Promise<string>; // returns new video URL
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface PlatformDistributionEngine {
  publish(request: PublishRequest): Promise<PublishResult[]>;
  schedule(request: PublishRequest): Promise<ScheduleEntry>;
  getOptimalSchedule(channelId: string, platform: DistributionPlatform): Promise<Date>;
  repurpose(videoUrl: string, fromFormat: string, toFormats: string[]): Promise<RepurposedContent[]>;
  getPlatformConfigs(): DistributionConfig[];
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

/**
 * Default implementation of PlatformDistributionEngine.
 *
 * Uses dependency injection for platform publishing, scheduling, audience
 * analysis, and video repurposing. Maintains platform-specific configuration
 * for aspect ratios, durations, and formatting conventions.
 */
export class DefaultPlatformDistributionEngine implements PlatformDistributionEngine {
  private static readonly PLATFORM_CONFIGS: DistributionConfig[] = [
    {
      platform: 'youtube',
      aspectRatio: '16:9',
      maxDuration: 43200, // 12 hours
      captionFormat: 'SRT',
      hashtagConvention: '3-5 hashtags in description',
    },
    {
      platform: 'tiktok',
      aspectRatio: '9:16',
      maxDuration: 600, // 10 minutes
      captionFormat: 'embedded',
      hashtagConvention: '3-5 hashtags in caption',
    },
    {
      platform: 'instagram',
      aspectRatio: '9:16',
      maxDuration: 90, // Reels
      captionFormat: 'embedded',
      hashtagConvention: 'up to 30 hashtags in caption',
    },
    {
      platform: 'x',
      aspectRatio: '16:9',
      maxDuration: 140, // ~2 min 20 sec
      captionFormat: 'embedded',
      hashtagConvention: '1-2 hashtags in post',
    },
    {
      platform: 'facebook',
      aspectRatio: '16:9',
      maxDuration: 14400, // 4 hours
      captionFormat: 'SRT',
      hashtagConvention: '2-3 hashtags in description',
    },
    {
      platform: 'rumble',
      aspectRatio: '16:9',
      maxDuration: 14400,
      captionFormat: 'SRT',
      hashtagConvention: '3-5 tags',
    },
  ];

  private idCounter = 0;

  constructor(
    private readonly publisher: PlatformPublisher,
    private readonly scheduleStore: ScheduleStore,
    private readonly audienceAnalyzer: AudienceAnalyzer,
    private readonly repurposer: VideoRepurposer,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Publishes a video to all specified platforms concurrently.
   * Returns results for each platform (success or failure).
   */
  async publish(request: PublishRequest): Promise<PublishResult[]> {
    const results = await Promise.all(
      request.platforms.map((platform) =>
        this.publisher
          .publish(platform, request.videoUrl, request.metadata, request.thumbnailUrl)
          .catch((err: Error) => ({
            platform,
            success: false,
            error: err.message,
          } as PublishResult)),
      ),
    );

    return results;
  }

  /**
   * Schedules a publish request for a future time.
   * If no scheduledAt is provided, uses the optimal time for the first platform.
   */
  async schedule(request: PublishRequest): Promise<ScheduleEntry> {
    const scheduledId = this.generateId();
    const scheduledAt = request.scheduledAt
      ?? await this.audienceAnalyzer.getOptimalPostTime(request.channelId, request.platforms[0]);

    await this.scheduleStore.save({ scheduledId, request, scheduledAt });

    return { scheduledId, scheduledAt };
  }

  /**
   * Returns the optimal posting time for a channel on a given platform.
   */
  async getOptimalSchedule(channelId: string, platform: DistributionPlatform): Promise<Date> {
    return this.audienceAnalyzer.getOptimalPostTime(channelId, platform);
  }

  /**
   * Repurposes a video from one format to multiple target formats.
   * E.g., long-form YouTube → TikTok short, Instagram Reel, X clip.
   */
  async repurpose(videoUrl: string, fromFormat: string, toFormats: string[]): Promise<RepurposedContent[]> {
    const results = await Promise.all(
      toFormats.map(async (toFormat) => {
        const newUrl = await this.repurposer.repurpose(videoUrl, fromFormat, toFormat);
        return { format: toFormat, videoUrl: newUrl };
      }),
    );

    return results;
  }

  /**
   * Returns platform-specific distribution configurations.
   */
  getPlatformConfigs(): DistributionConfig[] {
    return [...DefaultPlatformDistributionEngine.PLATFORM_CONFIGS];
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private generateId(): string {
    this.idCounter++;
    return `sched-${Date.now()}-${this.idCounter}`;
  }
}

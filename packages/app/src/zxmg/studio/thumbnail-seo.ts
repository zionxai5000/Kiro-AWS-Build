/**
 * ZXMG Video Development Studio — Thumbnail & SEO Generator
 *
 * Generates multiple thumbnail variants with predicted CTR, produces
 * SEO-optimized metadata (titles, descriptions, tags, hashtags), records
 * A/B test results, and learns effective patterns from Zikaron memory.
 *
 * Requirements: 44d.21, 44d.22, 44d.23
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThumbnailVariant {
  id: string;
  url: string;
  style: string;
  predictedCTR: number; // 0-100
}

export interface SEOMetadata {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  seoScore: number; // 0-100
}

export interface ABTestResult {
  variantId: string;
  impressions: number;
  clicks: number;
  ctr: number;
  winner: boolean;
}

export interface LearnedPattern {
  pattern: string;
  effectiveness: number; // 0-100
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface ThumbnailRenderer {
  render(videoId: string, title: string, style: string): Promise<{ url: string; predictedCTR: number }>;
}

export interface SEOAnalyzer {
  analyze(title: string, description: string, niche: string): Promise<{
    optimizedTitle: string;
    optimizedDescription: string;
    suggestedTags: string[];
    suggestedHashtags: string[];
    score: number;
  }>;
}

export interface ABTestStore {
  save(videoId: string, results: ABTestResult[]): Promise<void>;
  getByChannel(channelId: string): Promise<{ videoId: string; results: ABTestResult[] }[]>;
}

export interface ZikaronPatternStore {
  storePattern(channelId: string, pattern: string, effectiveness: number): Promise<void>;
  getPatterns(channelId: string): Promise<LearnedPattern[]>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface ThumbnailSEOGenerator {
  generateThumbnails(videoId: string, title: string, style: string, count?: number): Promise<ThumbnailVariant[]>;
  generateSEO(videoId: string, title: string, description: string, niche: string): Promise<SEOMetadata>;
  recordABTestResult(videoId: string, results: ABTestResult[]): Promise<void>;
  getLearnedPatterns(channelId: string): Promise<LearnedPattern[]>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

/**
 * Default implementation of ThumbnailSEOGenerator.
 *
 * Uses dependency injection for thumbnail rendering, SEO analysis,
 * A/B test storage, and Zikaron pattern learning. Generates minimum 3
 * thumbnail variants per request and learns from A/B test winners.
 */
export class DefaultThumbnailSEOGenerator implements ThumbnailSEOGenerator {
  private static readonly MIN_THUMBNAILS = 3;
  private static readonly DEFAULT_THUMBNAIL_COUNT = 3;

  private idCounter = 0;

  constructor(
    private readonly renderer: ThumbnailRenderer,
    private readonly seoAnalyzer: SEOAnalyzer,
    private readonly abTestStore: ABTestStore,
    private readonly patternStore: ZikaronPatternStore,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Generates thumbnail variants for a video.
   * Always produces at least 3 variants regardless of count parameter.
   */
  async generateThumbnails(
    videoId: string,
    title: string,
    style: string,
    count?: number,
  ): Promise<ThumbnailVariant[]> {
    const numVariants = Math.max(
      DefaultThumbnailSEOGenerator.MIN_THUMBNAILS,
      count ?? DefaultThumbnailSEOGenerator.DEFAULT_THUMBNAIL_COUNT,
    );

    const styles = this.getStyleVariations(style, numVariants);

    const variants = await Promise.all(
      styles.map(async (variantStyle) => {
        const { url, predictedCTR } = await this.renderer.render(videoId, title, variantStyle);
        const id = this.generateId();
        return {
          id,
          url,
          style: variantStyle,
          predictedCTR,
        };
      }),
    );

    // Sort by predicted CTR descending
    return variants.sort((a, b) => b.predictedCTR - a.predictedCTR);
  }

  /**
   * Generates SEO-optimized metadata for a video.
   * Returns title, description, tags, hashtags, and an SEO score (0-100).
   */
  async generateSEO(
    videoId: string,
    title: string,
    description: string,
    niche: string,
  ): Promise<SEOMetadata> {
    const analysis = await this.seoAnalyzer.analyze(title, description, niche);

    return {
      title: analysis.optimizedTitle,
      description: analysis.optimizedDescription,
      tags: analysis.suggestedTags,
      hashtags: analysis.suggestedHashtags,
      seoScore: analysis.score,
    };
  }

  /**
   * Records A/B test results and learns from winning patterns.
   * Stores the winner's style as a learned pattern in Zikaron.
   */
  async recordABTestResult(videoId: string, results: ABTestResult[]): Promise<void> {
    await this.abTestStore.save(videoId, results);

    // Learn from winners
    const winners = results.filter((r) => r.winner);
    for (const winner of winners) {
      const effectiveness = Math.min(100, Math.round(winner.ctr * 10));
      await this.patternStore.storePattern(
        videoId,
        `variant-${winner.variantId}-ctr-${winner.ctr.toFixed(1)}`,
        effectiveness,
      );
    }
  }

  /**
   * Retrieves learned patterns from Zikaron for a channel.
   * Returns patterns sorted by effectiveness descending.
   */
  async getLearnedPatterns(channelId: string): Promise<LearnedPattern[]> {
    const patterns = await this.patternStore.getPatterns(channelId);
    return patterns.sort((a, b) => b.effectiveness - a.effectiveness);
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private generateId(): string {
    this.idCounter++;
    return `thumb-${Date.now()}-${this.idCounter}`;
  }

  /**
   * Generates style variations for thumbnail rendering.
   * Creates distinct visual approaches based on the base style.
   */
  private getStyleVariations(baseStyle: string, count: number): string[] {
    const variations = [
      baseStyle,
      `${baseStyle}-bold`,
      `${baseStyle}-minimal`,
      `${baseStyle}-dramatic`,
      `${baseStyle}-colorful`,
    ];

    return variations.slice(0, count);
  }
}

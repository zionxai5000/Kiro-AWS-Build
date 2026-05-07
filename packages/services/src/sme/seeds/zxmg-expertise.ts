/**
 * Seed Domain Expertise Profile for ZXMG — Media Production Sub-Agent.
 *
 * Encodes knowledge of:
 * - YouTube algorithm signals and ranking factors
 * - Thumbnail/title optimization patterns
 * - Content structure patterns for audience retention
 * - Posting cadence benchmarks
 * - Cross-platform repurposing strategies
 * - Monetization benchmarks (CPM, RPM)
 *
 * Requirements: 23.4
 */

import type { SeedProfileInput } from '../domain-expertise-profile.js';

export const ZXMG_AGENT_ID = 'agent-zxmg';

export const zxmgExpertiseSeed: SeedProfileInput = {
  agentId: ZXMG_AGENT_ID,
  domain: 'media-production',
  knowledgeEntries: [
    // YouTube Algorithm Signals
    {
      topic: 'YouTube Algorithm Primary Signals',
      content:
        'YouTube algorithm prioritizes: 1) Click-through rate (CTR) — target >8%, 2) Average view duration (AVD) — target >50% of video length, 3) Session watch time — videos that lead to more watching, 4) Engagement rate (likes, comments, shares). CTR and AVD are the two most important signals.',
      source: 'youtube-creator-academy',
      confidence: 0.93,
      lastVerified: new Date('2025-01-01'),
      tags: ['algorithm', 'ranking-factors', 'youtube'],
    },
    {
      topic: 'YouTube Browse vs Search Discovery',
      content:
        'Browse features (homepage, suggested) drive 70-80% of views for established channels. Search drives initial discovery for new channels. Suggested videos algorithm heavily weights viewer history and topic similarity.',
      source: 'youtube-analytics-research',
      confidence: 0.88,
      lastVerified: new Date('2025-01-01'),
      tags: ['algorithm', 'discovery', 'youtube'],
    },
    {
      topic: 'YouTube Shorts Algorithm',
      content:
        'Shorts algorithm is separate from long-form. Key signals: swipe-away rate (lower is better), replay rate, like-to-view ratio. Shorts can drive subscribers but have lower RPM ($0.05-$0.10 per 1000 views).',
      source: 'youtube-shorts-documentation',
      confidence: 0.85,
      lastVerified: new Date('2025-01-15'),
      tags: ['algorithm', 'shorts', 'youtube'],
    },
    // Thumbnail Optimization
    {
      topic: 'Thumbnail Design Patterns',
      content:
        'High-CTR thumbnails use: 1) Faces with exaggerated expressions (2-3x CTR boost), 2) High contrast colors (yellow, red against dark backgrounds), 3) Maximum 3-4 words of text, 4) Clear focal point with rule of thirds, 5) Curiosity gap (show outcome without revealing how).',
      source: 'vidiq-thumbnail-analysis',
      confidence: 0.9,
      lastVerified: new Date('2025-01-01'),
      tags: ['thumbnail', 'ctr', 'optimization'],
    },
    // Title Optimization
    {
      topic: 'Title Optimization Patterns',
      content:
        'High-performing titles: 1) Front-load keywords for search, 2) Use numbers (listicles get 36% more clicks), 3) Create curiosity gap without clickbait, 4) Keep under 60 characters for full display, 5) Include emotional triggers (surprising, shocking, essential).',
      source: 'tubebuddy-title-research',
      confidence: 0.87,
      lastVerified: new Date('2025-01-01'),
      tags: ['title', 'ctr', 'optimization'],
    },
    // Content Structure
    {
      topic: 'Content Structure for Retention',
      content:
        'Optimal video structure: Hook (0-30s) → Context (30s-1m) → Value delivery (body) → Pattern interrupt every 2-3 minutes → CTA → End screen. The first 30 seconds determine 60% of viewer retention. Use open loops to maintain curiosity.',
      source: 'creator-retention-analysis',
      confidence: 0.91,
      lastVerified: new Date('2025-01-10'),
      tags: ['content-structure', 'retention', 'hooks'],
    },
    {
      topic: 'Optimal Video Length by Category',
      content:
        'Optimal lengths: Educational 10-15 minutes, Entertainment 8-12 minutes, Tutorials 5-20 minutes (task-dependent), Vlogs 12-18 minutes. Videos between 8-12 minutes hit the sweet spot for ad revenue (mid-roll eligible) and retention.',
      source: 'social-blade-analytics',
      confidence: 0.84,
      lastVerified: new Date('2025-01-10'),
      tags: ['content-structure', 'video-length', 'optimization'],
    },
    // Posting Cadence
    {
      topic: 'Posting Cadence Benchmarks',
      content:
        'Optimal posting frequency: 2-3 long-form videos per week for growth channels. Consistency matters more than frequency. Channels posting 2x/week grow 2x faster than 1x/week. Shorts: 3-7 per week for maximum algorithm favor.',
      source: 'youtube-growth-study-2024',
      confidence: 0.86,
      lastVerified: new Date('2025-01-15'),
      tags: ['cadence', 'posting-schedule', 'growth'],
    },
    {
      topic: 'Best Posting Times',
      content:
        'Optimal upload times (US audience): Weekdays 2-4 PM EST (pre-evening browsing), Weekends 9-11 AM EST. Schedule 2-3 hours before peak viewing to allow algorithm indexing. Consistency in posting time builds audience habits.',
      source: 'tubebuddy-analytics',
      confidence: 0.79,
      lastVerified: new Date('2025-01-15'),
      tags: ['cadence', 'timing', 'scheduling'],
    },
    // Cross-Platform Repurposing
    {
      topic: 'Cross-Platform Repurposing Strategy',
      content:
        'Repurposing hierarchy: Long-form YouTube → YouTube Shorts (key moments) → TikTok (reformatted) → Instagram Reels → Twitter/X clips → LinkedIn (professional angle) → Blog post (SEO). Each platform needs native formatting, not just re-uploads.',
      source: 'multi-platform-creator-playbook',
      confidence: 0.88,
      lastVerified: new Date('2025-01-20'),
      tags: ['cross-platform', 'repurposing', 'distribution'],
    },
    {
      topic: 'Platform-Specific Formatting',
      content:
        'TikTok: 9:16 vertical, 30-60s optimal, trending sounds boost reach. Instagram Reels: 9:16, 15-30s for discovery, 60-90s for engagement. Twitter/X: 16:9 or 1:1, under 2:20, captions essential (85% watch muted).',
      source: 'social-media-benchmarks-2024',
      confidence: 0.85,
      lastVerified: new Date('2025-01-20'),
      tags: ['cross-platform', 'formatting', 'specifications'],
    },
    // Monetization Benchmarks
    {
      topic: 'YouTube CPM Benchmarks by Niche',
      content:
        'Average CPM by niche: Finance $25-$45, Technology $12-$20, Business $15-$30, Health $10-$18, Entertainment $3-$8, Gaming $4-$10, Education $8-$15. CPM varies 3-5x by geography (US highest).',
      source: 'youtube-monetization-report-2024',
      confidence: 0.87,
      lastVerified: new Date('2025-02-01'),
      tags: ['monetization', 'cpm', 'benchmarks'],
    },
    {
      topic: 'YouTube RPM and Revenue Benchmarks',
      content:
        'RPM (Revenue Per Mille) = total revenue / views × 1000. Average RPM: $3-$8 for most channels. Top finance channels: $15-$25 RPM. Sponsorships add 2-5x AdSense revenue for channels with 100K+ subscribers.',
      source: 'creator-economy-report-2024',
      confidence: 0.85,
      lastVerified: new Date('2025-02-01'),
      tags: ['monetization', 'rpm', 'revenue'],
    },
  ],
  decisionFrameworks: [
    {
      name: 'Content Topic Selection',
      description:
        'Select video topics based on search demand, competition, and channel authority',
      inputs: ['search_volume', 'competition_score', 'channel_authority', 'trending_score'],
      decisionTree: [
        {
          condition: 'Is search volume > 10K/month and competition < 50?',
          trueAction: 'High priority — create comprehensive video targeting this keyword',
          falseAction: {
            condition: 'Is topic trending (trending score > 70)?',
            trueAction: 'Medium priority — create timely content within 48 hours',
            falseAction: {
              condition: 'Does channel have authority in this niche (authority > 60)?',
              trueAction: 'Create as part of content series for loyal audience',
              falseAction: 'Skip — insufficient demand or authority',
            },
          },
        },
      ],
      historicalAccuracy: 0.75,
      lastCalibrated: new Date('2025-01-01'),
    },
    {
      name: 'Thumbnail A/B Testing Framework',
      description: 'Decide when and how to A/B test thumbnails for maximum CTR',
      inputs: ['current_ctr', 'impressions_count', 'video_age_days'],
      decisionTree: [
        {
          condition: 'Is CTR below 5% after 48 hours with >1000 impressions?',
          trueAction: 'Immediately create and test new thumbnail variant',
          falseAction: {
            condition: 'Is CTR between 5-8% after 7 days?',
            trueAction: 'Test one alternative thumbnail with different emotional angle',
            falseAction: 'Keep current thumbnail — performing well',
          },
        },
      ],
      historicalAccuracy: 0.8,
      lastCalibrated: new Date('2025-01-01'),
    },
  ],
  qualityBenchmarks: [
    {
      metric: 'Click-Through Rate (CTR)',
      worldClass: 0.12,
      current: 0,
      unit: 'percentage',
      source: 'top-1%-youtube-channels',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Average View Duration',
      worldClass: 0.6,
      current: 0,
      unit: 'percentage of video length',
      source: 'top-performing-channels',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Subscriber Conversion Rate',
      worldClass: 0.05,
      current: 0,
      unit: 'subscribers per view',
      source: 'fastest-growing-channels',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Upload Consistency',
      worldClass: 1.0,
      current: 0,
      unit: 'on-schedule rate',
      source: 'top-creator-habits',
      lastUpdated: new Date('2025-01-01'),
    },
  ],
  bestPractices: [
    {
      title: 'Hook Formula',
      description:
        'Start every video with a hook that creates curiosity, states the value proposition, or presents a surprising fact within the first 5 seconds. Avoid channel intros before the hook.',
      domain: 'media-production',
      source: 'top-creator-analysis',
      confidence: 0.92,
      tags: ['hooks', 'retention', 'structure'],
    },
    {
      title: 'Pattern Interrupts',
      description:
        'Insert visual or audio pattern interrupts every 2-3 minutes: B-roll cuts, graphics, camera angle changes, sound effects, or topic transitions. This resets viewer attention and reduces drop-off.',
      domain: 'media-production',
      source: 'retention-optimization-study',
      confidence: 0.88,
      tags: ['retention', 'editing', 'engagement'],
    },
  ],
  knowledgeGaps: [
    'AI-generated content detection and platform policies',
    'Optimal collaboration strategies for channel growth',
    'Podcast-to-YouTube conversion best practices',
  ],
  researchBacklog: [
    {
      topic: 'YouTube algorithm changes Q1 2025',
      priority: 9,
      reason: 'Algorithm updates directly impact content strategy',
      addedAt: new Date('2025-01-01'),
    },
    {
      topic: 'AI video generation tools for production efficiency',
      priority: 7,
      reason: 'Could reduce production costs by 50%+',
      addedAt: new Date('2025-01-01'),
    },
  ],
};

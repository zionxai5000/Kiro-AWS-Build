/**
 * Seed Domain Expertise Profile for ZionX — App Factory Sub-Agent.
 *
 * Encodes knowledge of:
 * - App store optimization strategies
 * - Monetization model benchmarks (subscription vs IAP vs ad-supported)
 * - User acquisition cost benchmarks by channel
 * - Retention curve benchmarks by app category
 * - Apple/Google review guidelines and common rejection patterns
 * - Competitive analysis frameworks
 *
 * Requirements: 23.3
 */

import type { SeedProfileInput } from '../domain-expertise-profile.js';

export const ZIONX_AGENT_ID = 'agent-zionx';

export const zionxExpertiseSeed: SeedProfileInput = {
  agentId: ZIONX_AGENT_ID,
  domain: 'app-development',
  knowledgeEntries: [
    // ASO Strategies
    {
      topic: 'ASO Title Optimization',
      content:
        'App title keywords carry approximately 10x more weight than subtitle/description keywords in App Store search ranking. Keep titles under 30 characters for full visibility.',
      source: 'apple-developer-documentation',
      confidence: 0.92,
      lastVerified: new Date('2025-01-01'),
      tags: ['aso', 'keywords', 'title'],
    },
    {
      topic: 'ASO Keyword Strategy',
      content:
        'Long-tail keywords with lower competition yield better ranking results for new apps. Target keywords with difficulty score < 40 and search volume > 20 for initial launches.',
      source: 'sensor-tower-aso-guide',
      confidence: 0.85,
      lastVerified: new Date('2025-01-01'),
      tags: ['aso', 'keywords', 'strategy'],
    },
    {
      topic: 'ASO Screenshot Optimization',
      content:
        'Localized screenshots increase conversion rate by 25-40%. First 3 screenshots are most critical as they appear in search results. Use captions highlighting key benefits.',
      source: 'splitmetrics-research',
      confidence: 0.88,
      lastVerified: new Date('2025-01-01'),
      tags: ['aso', 'screenshots', 'conversion'],
    },
    // Monetization Benchmarks
    {
      topic: 'Subscription Model Benchmarks',
      content:
        'Subscription apps generate 3x higher LTV than IAP-only apps. Average subscription conversion rate is 2-5% of active users. Annual plans have 40% higher retention than monthly.',
      source: 'revenucat-state-of-subscriptions-2024',
      confidence: 0.9,
      lastVerified: new Date('2025-01-15'),
      tags: ['monetization', 'subscription', 'benchmarks'],
    },
    {
      topic: 'IAP Revenue Benchmarks',
      content:
        'Top-grossing games earn $0.15-$0.50 ARPDAU. Consumable IAPs drive 70% of gaming revenue. Non-gaming apps average $0.02-$0.08 ARPDAU from IAP.',
      source: 'data-ai-market-report-2024',
      confidence: 0.85,
      lastVerified: new Date('2025-01-15'),
      tags: ['monetization', 'iap', 'benchmarks'],
    },
    {
      topic: 'Ad-Supported Model Benchmarks',
      content:
        'Rewarded video ads yield $15-$40 eCPM. Interstitial ads average $8-$15 eCPM. Banner ads average $1-$3 eCPM. Optimal ad frequency: 1 interstitial per 3-5 minutes of engagement.',
      source: 'applovin-monetization-report',
      confidence: 0.83,
      lastVerified: new Date('2025-01-15'),
      tags: ['monetization', 'ads', 'benchmarks'],
    },
    // User Acquisition Cost Benchmarks
    {
      topic: 'iOS User Acquisition Costs',
      content:
        'Average CPI (Cost Per Install) by channel: Apple Search Ads $2.50-$4.00, Facebook/Meta $3.00-$5.00, Google UAC $1.50-$3.00, TikTok $1.00-$2.50. Organic installs from ASO have $0 CPI.',
      source: 'liftoff-mobile-ad-report-2024',
      confidence: 0.82,
      lastVerified: new Date('2025-02-01'),
      tags: ['user-acquisition', 'cpi', 'ios'],
    },
    {
      topic: 'Android User Acquisition Costs',
      content:
        'Average CPI by channel: Google UAC $0.80-$2.00, Facebook/Meta $1.50-$3.50, Unity Ads $0.50-$1.50. Android CPIs are typically 30-50% lower than iOS but LTV is also lower.',
      source: 'liftoff-mobile-ad-report-2024',
      confidence: 0.82,
      lastVerified: new Date('2025-02-01'),
      tags: ['user-acquisition', 'cpi', 'android'],
    },
    // Retention Curve Benchmarks
    {
      topic: 'Retention Benchmarks by Category',
      content:
        'Day-1 retention benchmarks: Games 25-35%, Social 30-40%, Utilities 20-30%, Health/Fitness 20-25%. Day-7: Games 10-15%, Social 15-25%, Utilities 10-15%. Day-30: Games 3-5%, Social 8-12%.',
      source: 'adjust-mobile-benchmarks-2024',
      confidence: 0.87,
      lastVerified: new Date('2025-01-20'),
      tags: ['retention', 'benchmarks', 'category'],
    },
    {
      topic: 'Retention Improvement Strategies',
      content:
        'Push notifications improve Day-7 retention by 20-30% when personalized. Onboarding completion correlates with 2x Day-30 retention. Streak mechanics improve daily engagement by 40%.',
      source: 'clevertap-retention-study',
      confidence: 0.84,
      lastVerified: new Date('2025-01-20'),
      tags: ['retention', 'strategies', 'engagement'],
    },
    // Apple Review Guidelines
    {
      topic: 'Apple Review Common Rejections',
      content:
        'Top rejection reasons: 1) Guideline 4.3 (spam/copycat), 2) Guideline 2.1 (crashes/bugs), 3) Guideline 4.0 (design minimum), 4) Guideline 5.1.1 (data collection), 5) Guideline 3.1.1 (IAP requirement). Average review time: 24-48 hours.',
      source: 'apple-app-review-guidelines-2024',
      confidence: 0.95,
      lastVerified: new Date('2025-01-01'),
      tags: ['review-guidelines', 'apple', 'rejections'],
    },
    // Google Play Guidelines
    {
      topic: 'Google Play Policy Compliance',
      content:
        'Key policy areas: Data Safety section required, target API level must be within 1 year of latest, Families Policy for kids apps, deceptive behavior policy (no misleading claims). Review time: 1-7 days for new apps.',
      source: 'google-play-developer-policy',
      confidence: 0.93,
      lastVerified: new Date('2025-01-01'),
      tags: ['review-guidelines', 'google', 'policy'],
    },
  ],
  decisionFrameworks: [
    {
      name: 'Monetization Model Selection',
      description:
        'Choose optimal monetization model based on app category, target audience, and content type',
      inputs: ['app_category', 'target_audience', 'content_type', 'engagement_frequency'],
      decisionTree: [
        {
          condition: 'Is content consumable and regularly updated (news, media, fitness)?',
          trueAction: 'Use subscription model with free trial',
          falseAction: {
            condition: 'Is app a game with session-based engagement?',
            trueAction: 'Use IAP + rewarded ads hybrid',
            falseAction: {
              condition: 'Is app utility-focused with infrequent use?',
              trueAction: 'Use one-time purchase or freemium with premium unlock',
              falseAction: 'Use freemium with subscription for power users',
            },
          },
        },
      ],
      historicalAccuracy: 0.78,
      lastCalibrated: new Date('2025-01-01'),
    },
    {
      name: 'App Category Selection',
      description:
        'Select target app category based on market opportunity, competition density, and monetization potential',
      inputs: ['market_size', 'competition_count', 'average_revenue', 'development_complexity'],
      decisionTree: [
        {
          condition: 'Is market size > $1B and competition < 50 top apps?',
          trueAction: 'High priority — enter with differentiated positioning',
          falseAction: {
            condition: 'Is average revenue per app > $100K/month?',
            trueAction: 'Medium priority — enter with niche focus',
            falseAction: 'Low priority — skip unless unique angle exists',
          },
        },
      ],
      historicalAccuracy: 0.72,
      lastCalibrated: new Date('2025-01-01'),
    },
  ],
  qualityBenchmarks: [
    {
      metric: 'Day-1 Retention',
      worldClass: 0.45,
      current: 0,
      unit: 'percentage',
      source: 'industry-top-10-apps',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'App Store Rating',
      worldClass: 4.8,
      current: 0,
      unit: 'stars (1-5)',
      source: 'top-grossing-apps-average',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Crash-Free Rate',
      worldClass: 0.995,
      current: 0,
      unit: 'percentage',
      source: 'firebase-crashlytics-benchmarks',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Subscription Conversion Rate',
      worldClass: 0.08,
      current: 0,
      unit: 'percentage',
      source: 'revenucat-top-apps',
      lastUpdated: new Date('2025-01-01'),
    },
  ],
  competitiveIntelligence: [
    {
      competitor: 'Top Subscription Apps (Calm, Headspace)',
      domain: 'health-wellness',
      metrics: {
        monthlyRevenue: { value: 15_000_000, unit: 'USD' },
        subscriptionConversion: { value: 0.06, unit: 'percentage' },
        dayOneRetention: { value: 0.4, unit: 'percentage' },
      },
      strategies: ['free-trial-7-days', 'celebrity-content', 'daily-reminders', 'streak-mechanics'],
      strengths: ['brand-recognition', 'content-library', 'marketing-budget'],
      weaknesses: ['high-price-point', 'content-fatigue', 'limited-personalization'],
      lastUpdated: new Date('2025-01-01'),
    },
  ],
  bestPractices: [
    {
      title: 'Onboarding Flow Design',
      description:
        'Keep onboarding to 3-5 screens max. Show value before asking for permissions. Use progressive disclosure for complex features.',
      domain: 'app-development',
      source: 'ux-research-compilation',
      confidence: 0.9,
      tags: ['ux', 'onboarding', 'conversion'],
    },
    {
      title: 'App Store Listing A/B Testing',
      description:
        'Test icon, screenshots, and description separately. Run tests for minimum 7 days with 1000+ impressions per variant. Focus on conversion rate, not just installs.',
      domain: 'app-development',
      source: 'storemaven-best-practices',
      confidence: 0.87,
      tags: ['aso', 'testing', 'optimization'],
    },
  ],
  knowledgeGaps: [
    'Specific ASO keyword strategies for emerging categories',
    'Cross-promotion effectiveness between own apps',
    'Optimal pricing tiers by geography',
  ],
  researchBacklog: [
    {
      topic: 'AI-powered app personalization impact on retention',
      priority: 8,
      reason: 'Emerging trend with limited data on effectiveness',
      addedAt: new Date('2025-01-01'),
    },
    {
      topic: 'Apple Vision Pro app market opportunity',
      priority: 6,
      reason: 'New platform with first-mover advantage potential',
      addedAt: new Date('2025-01-01'),
    },
  ],
};

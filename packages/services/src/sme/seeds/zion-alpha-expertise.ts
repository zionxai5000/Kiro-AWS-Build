/**
 * Seed Domain Expertise Profile for Zion Alpha — Trading Sub-Agent.
 *
 * Encodes knowledge of:
 * - Prediction market mechanics for Kalshi and Polymarket
 * - Risk management frameworks
 * - Position sizing models (Kelly criterion, fractional Kelly)
 * - Market microstructure patterns
 * - Forecasting methodology benchmarks
 *
 * Requirements: 23.5
 */

import type { SeedProfileInput } from '../domain-expertise-profile.js';

export const ZION_ALPHA_AGENT_ID = 'agent-zion-alpha';

export const zionAlphaExpertiseSeed: SeedProfileInput = {
  agentId: ZION_ALPHA_AGENT_ID,
  domain: 'prediction-markets',
  knowledgeEntries: [
    // Prediction Market Mechanics
    {
      topic: 'Kalshi Market Mechanics',
      content:
        'Kalshi operates as a CFTC-regulated exchange with binary event contracts. Contracts settle at $1 (yes) or $0 (no). Fees: $0.01 per contract per side (maker/taker). Minimum tick size: $0.01. Markets cover economics, politics, weather, and finance events.',
      source: 'kalshi-documentation',
      confidence: 0.95,
      lastVerified: new Date('2025-01-01'),
      tags: ['kalshi', 'mechanics', 'regulation'],
    },
    {
      topic: 'Polymarket Mechanics',
      content:
        'Polymarket uses USDC on Polygon blockchain. Conditional tokens (CTFV2) represent outcomes. No trading fees but gas costs apply. Higher liquidity than Kalshi for political/crypto markets. Settlement via UMA oracle or manual resolution.',
      source: 'polymarket-documentation',
      confidence: 0.93,
      lastVerified: new Date('2025-01-01'),
      tags: ['polymarket', 'mechanics', 'crypto'],
    },
    {
      topic: 'Liquidity Patterns',
      content:
        'Prediction market liquidity concentrates near event dates. Bid-ask spreads: 1-3% for popular markets, 5-15% for thin markets. Liquidity peaks during US market hours (9am-5pm EST). Large orders (>$1000) should be split to avoid slippage.',
      source: 'market-microstructure-analysis',
      confidence: 0.87,
      lastVerified: new Date('2025-01-15'),
      tags: ['liquidity', 'microstructure', 'execution'],
    },
    // Risk Management Frameworks
    {
      topic: 'Maximum Drawdown Limits',
      content:
        'Professional risk management: Maximum single-position loss 2% of bankroll. Maximum daily drawdown 5% of bankroll. Maximum weekly drawdown 10%. Stop trading and review strategy after hitting any limit.',
      source: 'professional-trading-risk-management',
      confidence: 0.92,
      lastVerified: new Date('2025-01-01'),
      tags: ['risk-management', 'drawdown', 'limits'],
    },
    {
      topic: 'Correlation Risk',
      content:
        'Avoid correlated positions exceeding 20% of bankroll. Political markets are highly correlated (e.g., presidential race markets). Diversify across event categories: politics, economics, weather, sports, crypto.',
      source: 'portfolio-risk-theory',
      confidence: 0.88,
      lastVerified: new Date('2025-01-01'),
      tags: ['risk-management', 'correlation', 'diversification'],
    },
    {
      topic: 'Event Risk Assessment',
      content:
        'Categorize events by information asymmetry: High (insider-prone, e.g., corporate decisions), Medium (expert-advantage, e.g., economic data), Low (public-information, e.g., elections). Avoid high-asymmetry markets unless you have edge.',
      source: 'prediction-market-strategy-guide',
      confidence: 0.85,
      lastVerified: new Date('2025-01-10'),
      tags: ['risk-management', 'event-risk', 'information'],
    },
    // Position Sizing Models
    {
      topic: 'Kelly Criterion',
      content:
        'Kelly fraction f* = (bp - q) / b, where b = odds received, p = probability of winning, q = 1-p. Full Kelly maximizes long-term growth but has high variance. Never use full Kelly in practice due to estimation error in p.',
      source: 'kelly-criterion-mathematics',
      confidence: 0.95,
      lastVerified: new Date('2025-01-01'),
      tags: ['position-sizing', 'kelly', 'mathematics'],
    },
    {
      topic: 'Fractional Kelly',
      content:
        'Use 25-50% of Kelly (quarter to half Kelly) to reduce variance while maintaining 75-94% of growth rate. Quarter Kelly reduces drawdown by 75% vs full Kelly. Recommended: 25% Kelly for uncertain edge, 50% Kelly for well-calibrated models.',
      source: 'quantitative-trading-literature',
      confidence: 0.92,
      lastVerified: new Date('2025-01-01'),
      tags: ['position-sizing', 'fractional-kelly', 'variance'],
    },
    {
      topic: 'Fixed-Fractional Position Sizing',
      content:
        'Alternative to Kelly: risk fixed percentage (1-2%) of bankroll per trade regardless of edge size. Simpler to implement, more conservative. Suitable when edge estimation is unreliable. Ensures survival through losing streaks.',
      source: 'trading-risk-management-handbook',
      confidence: 0.9,
      lastVerified: new Date('2025-01-01'),
      tags: ['position-sizing', 'fixed-fractional', 'conservative'],
    },
    // Market Microstructure
    {
      topic: 'Order Book Dynamics',
      content:
        'Prediction market order books are thin compared to financial markets. Large market orders can move prices 5-10%. Use limit orders for positions > $500. Monitor order book depth before placing trades. Iceberg orders not available on most platforms.',
      source: 'market-microstructure-research',
      confidence: 0.86,
      lastVerified: new Date('2025-01-15'),
      tags: ['microstructure', 'order-book', 'execution'],
    },
    {
      topic: 'Price Discovery Patterns',
      content:
        'Prediction market prices converge to true probability as event approaches. Early prices reflect risk premium + uncertainty. Prices move in steps around news events. Arbitrage between Kalshi and Polymarket keeps prices within 2-5% of each other.',
      source: 'prediction-market-efficiency-study',
      confidence: 0.84,
      lastVerified: new Date('2025-01-15'),
      tags: ['microstructure', 'price-discovery', 'efficiency'],
    },
    // Forecasting Methodology
    {
      topic: 'Superforecasting Principles',
      content:
        'Key principles from superforecasting research: 1) Break problems into components, 2) Use base rates as starting point, 3) Update incrementally with new evidence, 4) Average multiple independent estimates, 5) Track calibration over time. Superforecasters are 30% more accurate than intelligence analysts.',
      source: 'tetlock-superforecasting-research',
      confidence: 0.91,
      lastVerified: new Date('2025-01-01'),
      tags: ['forecasting', 'methodology', 'calibration'],
    },
    {
      topic: 'Base Rate Analysis',
      content:
        'Always start with base rates: What percentage of similar events historically resolved Yes? Adjust from base rate using specific evidence. Common bias: ignoring base rates in favor of narrative. Track base rate accuracy to improve over time.',
      source: 'forecasting-methodology-handbook',
      confidence: 0.9,
      lastVerified: new Date('2025-01-01'),
      tags: ['forecasting', 'base-rates', 'calibration'],
    },
  ],
  decisionFrameworks: [
    {
      name: 'Trade Entry Decision',
      description:
        'Decide whether to enter a prediction market position based on edge, liquidity, and risk',
      inputs: ['estimated_probability', 'market_price', 'liquidity_depth', 'time_to_resolution', 'bankroll_percentage'],
      decisionTree: [
        {
          condition: 'Is estimated edge (|probability - price|) > 10%?',
          trueAction: {
            condition: 'Is liquidity sufficient for desired position size?',
            trueAction: 'Enter position using fractional Kelly sizing',
            falseAction: 'Enter smaller position limited by available liquidity',
          },
          falseAction: {
            condition: 'Is edge > 5% with high confidence (>80% in estimate)?',
            trueAction: 'Enter small position (quarter Kelly)',
            falseAction: 'No trade — insufficient edge',
          },
        },
      ],
      historicalAccuracy: 0.72,
      lastCalibrated: new Date('2025-01-01'),
    },
    {
      name: 'Position Exit Decision',
      description: 'Decide when to exit or reduce a prediction market position',
      inputs: ['current_pnl', 'remaining_edge', 'time_to_resolution', 'new_information'],
      decisionTree: [
        {
          condition: 'Has edge disappeared (new info changes probability estimate)?',
          trueAction: 'Exit full position immediately',
          falseAction: {
            condition: 'Is position at >3x profit and time to resolution > 30 days?',
            trueAction: 'Take partial profit (50%) and let remainder ride',
            falseAction: {
              condition: 'Has maximum loss limit been hit?',
              trueAction: 'Exit full position — risk management override',
              falseAction: 'Hold position — edge still exists',
            },
          },
        },
      ],
      historicalAccuracy: 0.68,
      lastCalibrated: new Date('2025-01-01'),
    },
  ],
  qualityBenchmarks: [
    {
      metric: 'Brier Score',
      worldClass: 0.15,
      current: 0.5,
      unit: 'lower is better (0-1)',
      source: 'superforecaster-benchmarks',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'ROI (Annual)',
      worldClass: 0.3,
      current: 0,
      unit: 'percentage',
      source: 'top-prediction-market-traders',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Win Rate',
      worldClass: 0.6,
      current: 0,
      unit: 'percentage',
      source: 'professional-traders',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Maximum Drawdown',
      worldClass: 0.15,
      current: 0,
      unit: 'percentage (lower is better)',
      source: 'risk-management-standards',
      lastUpdated: new Date('2025-01-01'),
    },
  ],
  bestPractices: [
    {
      title: 'Pre-Trade Checklist',
      description:
        'Before every trade: 1) Document probability estimate with reasoning, 2) Calculate Kelly fraction, 3) Check correlation with existing positions, 4) Verify liquidity, 5) Set stop-loss level, 6) Record in trade journal.',
      domain: 'prediction-markets',
      source: 'professional-trading-discipline',
      confidence: 0.93,
      tags: ['discipline', 'process', 'risk-management'],
    },
    {
      title: 'Calibration Tracking',
      description:
        'Track all predictions with confidence levels. Review calibration monthly: of events you rated 70% likely, did ~70% actually occur? Adjust confidence systematically based on calibration data.',
      domain: 'prediction-markets',
      source: 'superforecasting-methodology',
      confidence: 0.91,
      tags: ['calibration', 'tracking', 'improvement'],
    },
  ],
  knowledgeGaps: [
    'Optimal strategies for illiquid markets',
    'Machine learning models for event probability estimation',
    'Cross-market arbitrage automation',
  ],
  researchBacklog: [
    {
      topic: 'LLM-based forecasting accuracy vs human superforecasters',
      priority: 9,
      reason: 'Could provide automated edge detection',
      addedAt: new Date('2025-01-01'),
    },
    {
      topic: 'New prediction market platforms and liquidity sources',
      priority: 7,
      reason: 'More platforms = more arbitrage opportunities',
      addedAt: new Date('2025-01-01'),
    },
  ],
};

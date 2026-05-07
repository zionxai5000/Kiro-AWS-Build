/**
 * Seed Domain Expertise Profile for Eretz — Business Orchestration Sub-Agent.
 *
 * Encodes knowledge of:
 * - Conglomerate management strategies (BCG matrix, GE-McKinsey, portfolio theory)
 * - Cross-business synergy frameworks
 * - Business pattern extraction methodologies
 * - Portfolio metrics benchmarks (MRR tracking, unit economics, cohort analysis)
 * - Training cascade best practices
 * - Operational excellence benchmarks
 * - World-class conglomerate benchmarks (capital allocation, technology portfolio,
 *   operational excellence at scale, luxury/brand portfolio management)
 *
 * Requirements: 29g.23
 */

import type { SeedProfileInput } from '../domain-expertise-profile.js';

export const ERETZ_AGENT_ID = 'agent-eretz';

export const eretzExpertiseSeed: SeedProfileInput = {
  agentId: ERETZ_AGENT_ID,
  domain: 'business-orchestration',
  knowledgeEntries: [
    // Conglomerate Strategy
    {
      topic: 'BCG Growth-Share Matrix',
      content:
        'The BCG matrix classifies business units into Stars (high growth, high share), Cash Cows (low growth, high share), Question Marks (high growth, low share), and Dogs (low growth, low share). Allocate capital from Cash Cows to Stars and promising Question Marks. Divest Dogs unless strategic synergy justifies retention.',
      source: 'boston-consulting-group-strategy',
      confidence: 0.93,
      lastVerified: new Date('2025-01-01'),
      tags: ['conglomerate-strategy', 'bcg-matrix', 'portfolio-allocation'],
    },
    {
      topic: 'GE-McKinsey Nine-Box Matrix',
      content:
        'The GE-McKinsey matrix evaluates business units on industry attractiveness (market size, growth rate, profitability, competition) and competitive strength (market share, brand, margins, technology). Invest in top-right quadrant, selectively manage middle, harvest or divest bottom-left.',
      source: 'mckinsey-portfolio-planning',
      confidence: 0.91,
      lastVerified: new Date('2025-01-01'),
      tags: ['conglomerate-strategy', 'ge-mckinsey', 'portfolio-evaluation'],
    },
    {
      topic: 'Modern Portfolio Theory for Business Units',
      content:
        'Diversify business portfolio to minimize correlated risk. Optimal portfolio balances high-growth ventures with stable cash generators. Target portfolio beta < 1.0 for resilience. Correlation between business units should be < 0.4 for true diversification benefit.',
      source: 'corporate-strategy-research',
      confidence: 0.87,
      lastVerified: new Date('2025-01-01'),
      tags: ['conglomerate-strategy', 'portfolio-theory', 'diversification'],
    },

    // Synergy Frameworks
    {
      topic: 'Revenue Synergy Identification',
      content:
        'Cross-selling between business units yields 15-25% revenue uplift when customer segments overlap > 40%. Shared distribution channels reduce CAC by 30-50%. Bundle pricing across portfolio increases ARPU by 20-35%.',
      source: 'bain-synergy-research',
      confidence: 0.85,
      lastVerified: new Date('2025-01-15'),
      tags: ['synergy-frameworks', 'revenue', 'cross-selling'],
    },
    {
      topic: 'Cost Synergy Frameworks',
      content:
        'Shared services (finance, HR, legal) reduce overhead by 20-30%. Technology platform consolidation saves 25-40% on infrastructure. Procurement consolidation yields 10-20% savings through volume leverage. Realize 60-70% of identified synergies within 18 months.',
      source: 'mckinsey-merger-integration',
      confidence: 0.88,
      lastVerified: new Date('2025-01-15'),
      tags: ['synergy-frameworks', 'cost-reduction', 'shared-services'],
    },
    {
      topic: 'Knowledge Transfer Synergies',
      content:
        'Best practice sharing across business units improves operational metrics by 10-20%. Talent rotation programs increase cross-unit collaboration by 35%. Centralized R&D with distributed application accelerates innovation cycle by 25%.',
      source: 'harvard-business-review-synergies',
      confidence: 0.82,
      lastVerified: new Date('2025-01-15'),
      tags: ['synergy-frameworks', 'knowledge-transfer', 'talent'],
    },

    // Pattern Extraction
    {
      topic: 'Business Pattern Recognition Methodology',
      content:
        'Extract repeatable patterns by analyzing: 1) Growth trajectories across units, 2) Customer acquisition funnels, 3) Monetization model effectiveness, 4) Operational bottlenecks. Patterns with > 3 occurrences across units indicate systemic opportunity or risk.',
      source: 'internal-pattern-library',
      confidence: 0.84,
      lastVerified: new Date('2025-02-01'),
      tags: ['pattern-extraction', 'methodology', 'analysis'],
    },
    {
      topic: 'Success Pattern Codification',
      content:
        'Document winning patterns as playbooks: trigger conditions, execution steps, expected outcomes, and failure modes. Patterns achieving > 80% success rate across 3+ units qualify for mandatory adoption. Update patterns quarterly based on new data.',
      source: 'internal-pattern-library',
      confidence: 0.86,
      lastVerified: new Date('2025-02-01'),
      tags: ['pattern-extraction', 'codification', 'playbooks'],
    },
    {
      topic: 'Anti-Pattern Detection',
      content:
        'Monitor for recurring failure modes: premature scaling (burn rate > 3x revenue growth), feature bloat (usage < 5% on 40%+ features), market timing errors (launch > 6 months after window). Flag anti-patterns when detected in 2+ units simultaneously.',
      source: 'internal-pattern-library',
      confidence: 0.83,
      lastVerified: new Date('2025-02-01'),
      tags: ['pattern-extraction', 'anti-patterns', 'risk-detection'],
    },

    // Portfolio Metrics
    {
      topic: 'MRR Tracking and Growth Benchmarks',
      content:
        'Track MRR growth rate, net revenue retention (NRR), and expansion revenue separately per unit. World-class NRR > 130%. Healthy MRR growth: early-stage > 15% MoM, growth-stage > 8% MoM, mature > 3% MoM. Churn rate target < 2% monthly for B2B, < 5% for B2C.',
      source: 'saas-metrics-benchmarks-2024',
      confidence: 0.9,
      lastVerified: new Date('2025-01-20'),
      tags: ['portfolio-metrics', 'mrr', 'growth-benchmarks'],
    },
    {
      topic: 'Unit Economics Framework',
      content:
        'LTV:CAC ratio must exceed 3:1 for sustainable growth. Payback period target < 12 months for B2C, < 18 months for B2B. Gross margin > 70% for software, > 40% for services. Track contribution margin per unit to identify subsidy dependencies.',
      source: 'venture-capital-benchmarks',
      confidence: 0.91,
      lastVerified: new Date('2025-01-20'),
      tags: ['portfolio-metrics', 'unit-economics', 'ltv-cac'],
    },
    {
      topic: 'Cohort Analysis Best Practices',
      content:
        'Segment cohorts by acquisition channel, time period, and product tier. Track retention, revenue, and engagement curves per cohort. Healthy cohorts show flattening retention curve by month 6. Revenue per cohort should increase over time (negative churn). Compare cohort performance across business units for pattern detection.',
      source: 'analytics-best-practices',
      confidence: 0.88,
      lastVerified: new Date('2025-01-20'),
      tags: ['portfolio-metrics', 'cohort-analysis', 'retention'],
    },

    // Training Cascade
    {
      topic: 'Training Cascade Design Principles',
      content:
        'Structure training in tiers: L1 (awareness, all staff), L2 (competency, practitioners), L3 (mastery, leaders). Each tier trains the next. Cascade completion target: 80% coverage within 30 days. Include practical exercises at each level. Measure knowledge transfer with pre/post assessments.',
      source: 'organizational-learning-research',
      confidence: 0.86,
      lastVerified: new Date('2025-01-10'),
      tags: ['training-cascade', 'design', 'methodology'],
    },
    {
      topic: 'Cross-Unit Knowledge Propagation',
      content:
        'Successful patterns from one unit should propagate to others within 2 sprint cycles. Use internal case studies with quantified outcomes. Assign pattern champions in each unit. Track adoption rate and outcome delta vs. original implementation.',
      source: 'organizational-learning-research',
      confidence: 0.83,
      lastVerified: new Date('2025-01-10'),
      tags: ['training-cascade', 'propagation', 'knowledge-sharing'],
    },
    {
      topic: 'Continuous Improvement Feedback Loops',
      content:
        'Implement retrospectives at unit and portfolio level monthly. Capture lessons learned in structured format: context, action, outcome, recommendation. Feed insights back into training materials within 1 sprint. Track improvement velocity: target 5-10% efficiency gain per quarter.',
      source: 'lean-management-principles',
      confidence: 0.85,
      lastVerified: new Date('2025-01-10'),
      tags: ['training-cascade', 'feedback-loops', 'continuous-improvement'],
    },

    // Operational Excellence
    {
      topic: 'Operational Excellence Metrics',
      content:
        'Key operational metrics: cycle time (idea to production < 2 weeks), deployment frequency (daily for mature units), change failure rate (< 5%), MTTR (< 1 hour). Track operational maturity on 5-level scale per unit. Target Level 4+ for all units within 12 months.',
      source: 'dora-metrics-research',
      confidence: 0.9,
      lastVerified: new Date('2025-01-01'),
      tags: ['operational-excellence', 'metrics', 'dora'],
    },
    {
      topic: 'Process Standardization Framework',
      content:
        'Standardize core processes (deployment, incident response, planning) across units while allowing domain-specific customization. Standard processes reduce onboarding time by 40% and cross-unit mobility by 60%. Review and update standards quarterly.',
      source: 'operational-excellence-handbook',
      confidence: 0.87,
      lastVerified: new Date('2025-01-01'),
      tags: ['operational-excellence', 'standardization', 'processes'],
    },
    {
      topic: 'Resource Allocation Optimization',
      content:
        'Allocate resources using 70/20/10 rule: 70% to core business, 20% to adjacent opportunities, 10% to transformational bets. Rebalance quarterly based on performance. Units exceeding targets by > 20% earn additional allocation. Underperformers get 1 quarter remediation before reallocation.',
      source: 'corporate-strategy-playbook',
      confidence: 0.84,
      lastVerified: new Date('2025-01-01'),
      tags: ['operational-excellence', 'resource-allocation', 'strategy'],
    },

    // World-Class Benchmarks
    {
      topic: 'World-Class Capital Allocation Strategies',
      content:
        'Berkshire Hathaway model: decentralized operations with centralized capital allocation. Return hurdle rate of 15%+ for new investments. Maintain cash reserves of 20-30% for opportunistic acquisitions. Alphabet model: moonshot portfolio with 10% allocation to high-risk/high-reward ventures.',
      source: 'conglomerate-case-studies',
      confidence: 0.89,
      lastVerified: new Date('2025-02-01'),
      tags: ['world-class-benchmarks', 'capital-allocation', 'conglomerate'],
    },
    {
      topic: 'Technology Conglomerate Portfolio Management',
      content:
        'Leading tech conglomerates (Alphabet, Microsoft, Amazon) maintain 5-8 major business units with shared infrastructure. Platform strategy enables 40-60% cost sharing. Internal API economy drives innovation velocity. Portfolio review cadence: quarterly strategic, monthly operational.',
      source: 'technology-conglomerate-analysis',
      confidence: 0.87,
      lastVerified: new Date('2025-02-01'),
      tags: ['world-class-benchmarks', 'technology-portfolio', 'platform-strategy'],
    },
    {
      topic: 'Operational Excellence at Scale',
      content:
        'Toyota Production System principles applied to digital: eliminate waste (unused features, idle resources), continuous flow (CI/CD), pull-based work (demand-driven development), built-in quality (shift-left testing). Amazon two-pizza team model enables autonomy at scale with 6-10 person teams.',
      source: 'operational-excellence-at-scale',
      confidence: 0.88,
      lastVerified: new Date('2025-02-01'),
      tags: ['world-class-benchmarks', 'operational-scale', 'lean-digital'],
    },
    {
      topic: 'Luxury and Brand Portfolio Management',
      content:
        'LVMH model: maintain brand autonomy while sharing back-office. Each brand retains creative independence with centralized supply chain and distribution. Portfolio spans price points to capture full market. Danaher Business System: acquire, integrate, optimize using standardized playbook achieving 20%+ margin improvement.',
      source: 'luxury-conglomerate-strategy',
      confidence: 0.85,
      lastVerified: new Date('2025-02-01'),
      tags: ['world-class-benchmarks', 'brand-portfolio', 'luxury-management'],
    },
  ],
  decisionFrameworks: [
    {
      name: 'Portfolio Capital Allocation',
      description:
        'Determine optimal capital allocation across business units based on growth potential, market position, and strategic fit',
      inputs: ['unit_growth_rate', 'market_position', 'strategic_fit_score', 'capital_efficiency'],
      decisionTree: [
        {
          condition: 'Is unit growth rate > 15% MoM and LTV:CAC > 3:1?',
          trueAction: 'Increase allocation — Star unit, maximize growth investment',
          falseAction: {
            condition: 'Is unit profitable with stable margins > 40%?',
            trueAction: 'Maintain allocation — Cash Cow, harvest for portfolio funding',
            falseAction: {
              condition: 'Is strategic fit score > 0.7 and market opportunity > $100M?',
              trueAction: 'Selective investment — Question Mark, set 6-month milestone gates',
              falseAction: 'Reduce allocation — evaluate for restructuring or divestiture',
            },
          },
        },
      ],
      historicalAccuracy: 0.76,
      lastCalibrated: new Date('2025-01-01'),
    },
    {
      name: 'Synergy Opportunity Prioritization',
      description:
        'Prioritize cross-business synergy opportunities based on value potential, implementation complexity, and time to value',
      inputs: ['revenue_impact', 'cost_savings', 'implementation_effort', 'time_to_value'],
      decisionTree: [
        {
          condition: 'Is estimated annual value > $500K and implementation < 3 months?',
          trueAction: 'Immediate execution — quick win with high impact',
          falseAction: {
            condition: 'Is estimated annual value > $1M regardless of timeline?',
            trueAction: 'Strategic initiative — plan and resource for next quarter',
            falseAction: {
              condition: 'Does synergy enable future high-value opportunities?',
              trueAction: 'Foundation investment — build capability for future leverage',
              falseAction: 'Deprioritize — insufficient ROI for current portfolio stage',
            },
          },
        },
      ],
      historicalAccuracy: 0.73,
      lastCalibrated: new Date('2025-01-01'),
    },
    {
      name: 'Business Unit Health Assessment',
      description:
        'Assess overall health of a business unit and determine intervention level required',
      inputs: ['revenue_trend', 'margin_trend', 'customer_metrics', 'operational_metrics', 'team_health'],
      decisionTree: [
        {
          condition: 'Are all key metrics (revenue, margin, retention) trending positive?',
          trueAction: 'Healthy — maintain current strategy, explore expansion',
          falseAction: {
            condition: 'Is revenue growing but margins declining?',
            trueAction: 'Efficiency intervention — focus on unit economics and cost structure',
            falseAction: {
              condition: 'Is customer retention > 80% despite revenue decline?',
              trueAction: 'Growth intervention — invest in acquisition and expansion revenue',
              falseAction: 'Strategic review — evaluate product-market fit and pivot options',
            },
          },
        },
      ],
      historicalAccuracy: 0.8,
      lastCalibrated: new Date('2025-01-01'),
    },
  ],
  qualityBenchmarks: [
    {
      metric: 'Portfolio Revenue Growth',
      worldClass: 0.25,
      current: 0,
      unit: 'percentage YoY',
      source: 'top-tech-conglomerates',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Net Revenue Retention',
      worldClass: 1.3,
      current: 0,
      unit: 'ratio',
      source: 'saas-benchmarks-top-quartile',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Cross-Unit Synergy Realization',
      worldClass: 0.7,
      current: 0,
      unit: 'percentage of identified synergies',
      source: 'bain-merger-integration-benchmarks',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Operational Efficiency Score',
      worldClass: 0.85,
      current: 0,
      unit: 'composite score (0-1)',
      source: 'dora-elite-performers',
      lastUpdated: new Date('2025-01-01'),
    },
    {
      metric: 'Pattern Adoption Rate',
      worldClass: 0.8,
      current: 0,
      unit: 'percentage within 30 days',
      source: 'internal-learning-benchmarks',
      lastUpdated: new Date('2025-01-01'),
    },
  ],
  competitiveIntelligence: [
    {
      competitor: 'Alphabet (Google)',
      domain: 'technology-conglomerate',
      metrics: {
        annualRevenue: { value: 307_000_000_000, unit: 'USD' },
        operatingMargin: { value: 0.27, unit: 'percentage' },
        businessUnits: { value: 6, unit: 'count' },
      },
      strategies: ['platform-strategy', 'moonshot-portfolio', 'data-driven-allocation', 'internal-api-economy'],
      strengths: ['massive-scale', 'data-advantage', 'talent-density', 'infrastructure'],
      weaknesses: ['coordination-overhead', 'cannibalization-risk', 'regulatory-pressure'],
      lastUpdated: new Date('2025-01-01'),
    },
    {
      competitor: 'Berkshire Hathaway',
      domain: 'diversified-conglomerate',
      metrics: {
        annualRevenue: { value: 364_000_000_000, unit: 'USD' },
        operatingMargin: { value: 0.1, unit: 'percentage' },
        businessUnits: { value: 60, unit: 'count' },
      },
      strategies: ['decentralized-operations', 'centralized-capital', 'long-term-holding', 'management-autonomy'],
      strengths: ['capital-allocation', 'management-quality', 'diversification', 'patience'],
      weaknesses: ['succession-planning', 'technology-adoption', 'limited-synergies'],
      lastUpdated: new Date('2025-01-01'),
    },
  ],
  bestPractices: [
    {
      title: 'Portfolio Review Cadence',
      description:
        'Conduct weekly operational reviews (metrics dashboard), monthly strategic reviews (unit health), and quarterly portfolio rebalancing. Use standardized scorecards across all units for comparability.',
      domain: 'business-orchestration',
      source: 'conglomerate-management-playbook',
      confidence: 0.88,
      tags: ['governance', 'review-cadence', 'portfolio-management'],
    },
    {
      title: 'Synergy Tracking and Accountability',
      description:
        'Assign synergy owners with clear targets and timelines. Track synergy realization monthly against plan. Report synergy value as separate line item in portfolio P&L. Celebrate and propagate successful synergies.',
      domain: 'business-orchestration',
      source: 'merger-integration-best-practices',
      confidence: 0.85,
      tags: ['synergy', 'accountability', 'tracking'],
    },
  ],
  knowledgeGaps: [
    'Optimal portfolio size for AI-native conglomerates',
    'Cross-unit data sharing frameworks that preserve competitive advantage',
    'Automated synergy detection using operational telemetry',
  ],
  researchBacklog: [
    {
      topic: 'AI-driven portfolio optimization models',
      priority: 9,
      reason: 'Emerging capability to dynamically rebalance portfolio allocation using real-time signals',
      addedAt: new Date('2025-01-01'),
    },
    {
      topic: 'Network effects across portfolio businesses',
      priority: 7,
      reason: 'Quantifying compounding value of cross-unit network effects',
      addedAt: new Date('2025-01-01'),
    },
  ],
};

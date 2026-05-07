/**
 * ZionX App Factory — Agent Program Definition
 *
 * Defines the ZionX agent program with a full state machine for the app
 * lifecycle: ideation → market-research → development → testing → gate-review →
 * submission → in-review → approved/rejected → live → marketing →
 * revenue-optimizing → deprecated.
 *
 * Authority level L4 (autonomous within bounds).
 * Model preference: Tier 2 minimum for code generation.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11b.1, 11b.2, 11b.3,
 *               11b.4, 11b.5, 11b.6, 11b.7, 11b.8, 11b.9, 11b.10
 */

import type {
  AgentProgram,
  StateMachineDefinition,
  CompletionContract,
} from '@seraphim/core';

// ---------------------------------------------------------------------------
// ZionX State Machine Definition
// ---------------------------------------------------------------------------

export const ZIONX_STATE_MACHINE: StateMachineDefinition = {
  id: 'zionx-app-lifecycle',
  name: 'ZionX App Lifecycle',
  version: '2.0.0',

  states: {
    ideation: {
      name: 'ideation',
      type: 'initial',
      onEnter: [{ type: 'log', config: { message: 'App concept entered ideation phase' } }],
    },
    'market-research': {
      name: 'market-research',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Market research and niche validation started' } }],
      timeout: { duration: 43200000, transitionTo: 'ideation' }, // 12h timeout
    },
    development: {
      name: 'development',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Code generation started' } }],
      timeout: { duration: 86400000, transitionTo: 'ideation' }, // 24h timeout
    },
    testing: {
      name: 'testing',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Test execution started' } }],
      timeout: { duration: 3600000, transitionTo: 'development' }, // 1h timeout
    },
    'gate-review': {
      name: 'gate-review',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'Gate review checks initiated' } }],
    },
    submission: {
      name: 'submission',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'App submitted to store(s)' } }],
    },
    'in-review': {
      name: 'in-review',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'App is under store review' } }],
      timeout: { duration: 604800000, transitionTo: 'submission' }, // 7-day timeout
    },
    approved: {
      name: 'approved',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'App approved by store' } }],
    },
    rejected: {
      name: 'rejected',
      type: 'active',
      onEnter: [{ type: 'notify', config: { message: 'App rejected by store — parsing rejection reasons' } }],
    },
    live: {
      name: 'live',
      type: 'active',
      onEnter: [
        { type: 'notify', config: { message: 'App is live on store' } },
        { type: 'trigger_gtm', config: { action: 'generate_gtm_plan' } },
      ],
    },
    marketing: {
      name: 'marketing',
      type: 'active',
      onEnter: [
        { type: 'notify', config: { message: 'GTM engine activated — launching campaigns' } },
        { type: 'trigger_gtm', config: { action: 'launch_campaigns' } },
      ],
    },
    'revenue-optimizing': {
      name: 'revenue-optimizing',
      type: 'active',
      onEnter: [
        { type: 'notify', config: { message: 'Revenue optimization phase — analyzing metrics and tuning' } },
        { type: 'trigger_gtm', config: { action: 'optimize_revenue' } },
      ],
    },
    deprecated: {
      name: 'deprecated',
      type: 'terminal',
      onEnter: [{ type: 'notify', config: { message: 'App has been deprecated' } }],
    },
  },

  initialState: 'ideation',
  terminalStates: ['deprecated'],

  transitions: [
    // ideation → market-research
    {
      from: 'ideation',
      to: 'market-research',
      event: 'start_research',
      gates: [
        {
          id: 'gate-concept-defined',
          name: 'Concept Definition',
          type: 'validation',
          config: { requiresConceptDoc: true },
          required: true,
        },
      ],
      actions: [{ type: 'trigger_pipeline', config: { stage: 'market_research' } }],
    },
    // market-research → development
    {
      from: 'market-research',
      to: 'development',
      event: 'start_development',
      gates: [
        {
          id: 'gate-market-validated',
          name: 'Market Validation',
          type: 'validation',
          config: { requiresDemandScore: true, minimumDemandScore: 60 },
          required: true,
        },
      ],
      actions: [{ type: 'trigger_pipeline', config: { stage: 'code_generation' } }],
    },
    // market-research → ideation (market not viable)
    {
      from: 'market-research',
      to: 'ideation',
      event: 'market_rejected',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Market research rejected — niche not viable' } }],
    },
    // development → testing
    {
      from: 'development',
      to: 'testing',
      event: 'start_testing',
      gates: [
        {
          id: 'gate-code-complete',
          name: 'Code Compilation Check',
          type: 'validation',
          config: { requiresCompilation: true },
          required: true,
        },
      ],
      actions: [{ type: 'trigger_pipeline', config: { stage: 'test_execution' } }],
    },
    // testing → gate-review
    {
      from: 'testing',
      to: 'gate-review',
      event: 'start_gate_review',
      gates: [
        {
          id: 'gate-tests-pass',
          name: 'Test Suite Pass',
          type: 'validation',
          config: { requiresAllTestsPass: true },
          required: true,
        },
      ],
    },
    // gate-review → submission
    {
      from: 'gate-review',
      to: 'submission',
      event: 'submit_app',
      gates: [
        {
          id: 'gate-metadata',
          name: 'Metadata Validation',
          type: 'validation',
          config: { checkType: 'metadata' },
          required: true,
        },
        {
          id: 'gate-subscription',
          name: 'Subscription Compliance',
          type: 'validation',
          config: { checkType: 'subscription_compliance' },
          required: true,
        },
        {
          id: 'gate-iap-sandbox',
          name: 'IAP Sandbox Testing',
          type: 'validation',
          config: { checkType: 'iap_sandbox' },
          required: true,
        },
        {
          id: 'gate-screenshots',
          name: 'Screenshot Verification',
          type: 'validation',
          config: { checkType: 'screenshots' },
          required: true,
        },
        {
          id: 'gate-privacy-policy',
          name: 'Privacy Policy Presence',
          type: 'validation',
          config: { checkType: 'privacy_policy' },
          required: true,
        },
        {
          id: 'gate-eula',
          name: 'EULA Link Verification',
          type: 'validation',
          config: { checkType: 'eula' },
          required: true,
        },
      ],
      actions: [{ type: 'trigger_gtm', config: { action: 'generate_gtm_plan' } }],
    },
    // gate-review → development (gate failure sends back)
    {
      from: 'gate-review',
      to: 'development',
      event: 'gate_failed',
      gates: [],
      actions: [{ type: 'log', config: { message: 'Gate review failed, returning to development' } }],
    },
    // submission → in-review
    {
      from: 'submission',
      to: 'in-review',
      event: 'store_acknowledged',
      gates: [],
    },
    // in-review → approved
    {
      from: 'in-review',
      to: 'approved',
      event: 'store_approved',
      gates: [],
    },
    // in-review → rejected
    {
      from: 'in-review',
      to: 'rejected',
      event: 'store_rejected',
      gates: [],
      actions: [{ type: 'parse_rejection', config: {} }],
    },
    // approved → live
    {
      from: 'approved',
      to: 'live',
      event: 'release_to_store',
      gates: [
        {
          id: 'gate-release-approval',
          name: 'Release Approval',
          type: 'approval',
          config: { requiresAuthorityLevel: 'L4' },
          required: true,
        },
      ],
    },
    // rejected → development (fix and resubmit)
    {
      from: 'rejected',
      to: 'development',
      event: 'fix_rejection',
      gates: [],
      actions: [{ type: 'create_remediation_plan', config: {} }],
    },
    // live → marketing
    {
      from: 'live',
      to: 'marketing',
      event: 'start_marketing',
      gates: [
        {
          id: 'gate-gtm-plan-ready',
          name: 'GTM Plan Ready',
          type: 'validation',
          config: { requiresGtmPlan: true },
          required: true,
        },
      ],
      actions: [
        { type: 'trigger_gtm', config: { action: 'launch_aso' } },
        { type: 'trigger_gtm', config: { action: 'launch_campaigns' } },
        { type: 'trigger_gtm', config: { action: 'generate_landing_page' } },
      ],
    },
    // marketing → revenue-optimizing
    {
      from: 'marketing',
      to: 'revenue-optimizing',
      event: 'start_optimization',
      gates: [
        {
          id: 'gate-minimum-live-days',
          name: 'Minimum Live Duration',
          type: 'condition',
          config: { minimumDaysLive: 7 },
          required: true,
        },
      ],
      actions: [{ type: 'trigger_gtm', config: { action: 'analyze_performance' } }],
    },
    // revenue-optimizing → marketing (re-engage declining app)
    {
      from: 'revenue-optimizing',
      to: 'marketing',
      event: 'relaunch_marketing',
      gates: [],
      actions: [{ type: 'trigger_gtm', config: { action: 're_engagement' } }],
    },
    // live → deprecated
    {
      from: 'live',
      to: 'deprecated',
      event: 'deprecate_app',
      gates: [
        {
          id: 'gate-deprecation-approval',
          name: 'Deprecation Approval',
          type: 'approval',
          config: { requiresAuthorityLevel: 'L2' },
          required: true,
        },
      ],
    },
    // marketing → deprecated
    {
      from: 'marketing',
      to: 'deprecated',
      event: 'deprecate_app',
      gates: [
        {
          id: 'gate-deprecation-approval-marketing',
          name: 'Deprecation Approval',
          type: 'approval',
          config: { requiresAuthorityLevel: 'L2' },
          required: true,
        },
      ],
    },
    // revenue-optimizing → deprecated
    {
      from: 'revenue-optimizing',
      to: 'deprecated',
      event: 'deprecate_app',
      gates: [
        {
          id: 'gate-deprecation-approval-optimizing',
          name: 'Deprecation Approval',
          type: 'approval',
          config: { requiresAuthorityLevel: 'L2' },
          required: true,
        },
      ],
    },
  ],

  metadata: {
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-15T00:00:00Z'),
    description:
      'ZionX App Factory lifecycle state machine — manages apps from ideation through market research, store submission, review, live deployment, marketing, and revenue optimization.',
  },
};

// ---------------------------------------------------------------------------
// Completion Contracts
// ---------------------------------------------------------------------------

export const ZIONX_COMPLETION_CONTRACTS: CompletionContract[] = [
  {
    id: 'zionx-market-research-complete',
    workflowType: 'market-research',
    version: '1.0.0',
    outputSchema: {
      type: 'object',
      required: ['nicheAnalysis', 'demandScore', 'competitorCount'],
      properties: {
        nicheAnalysis: { type: 'object' },
        demandScore: { type: 'number', minimum: 0, maximum: 100 },
        competitorCount: { type: 'number' },
        pricingGaps: { type: 'array', items: { type: 'object' } },
        recommendation: { type: 'string', enum: ['proceed', 'pivot', 'abandon'] },
      },
    },
    verificationSteps: [
      {
        name: 'Demand score above threshold',
        type: 'schema_validation',
        config: { minimumDemandScore: 60 },
        required: true,
        timeout: 120000,
      },
    ],
    description: 'Validates that market research produced actionable niche analysis.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'zionx-development-complete',
    workflowType: 'development',
    version: '1.0.0',
    outputSchema: {
      type: 'object',
      required: ['sourceCode', 'compilationResult', 'platform'],
      properties: {
        sourceCode: { type: 'string', description: 'Path to generated source code' },
        compilationResult: {
          type: 'object',
          required: ['success'],
          properties: {
            success: { type: 'boolean' },
            errors: { type: 'array', items: { type: 'string' } },
          },
        },
        platform: { type: 'string', enum: ['ios', 'android', 'both'] },
      },
    },
    verificationSteps: [
      {
        name: 'Code compilation check',
        type: 'automated_test',
        config: { command: 'build' },
        required: true,
        timeout: 300000,
      },
    ],
    description: 'Validates that code generation and compilation completed successfully.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'zionx-testing-complete',
    workflowType: 'testing',
    version: '1.0.0',
    outputSchema: {
      type: 'object',
      required: ['testResults', 'coveragePercent'],
      properties: {
        testResults: {
          type: 'object',
          required: ['passed', 'failed', 'total'],
          properties: {
            passed: { type: 'number' },
            failed: { type: 'number' },
            total: { type: 'number' },
          },
        },
        coveragePercent: { type: 'number', minimum: 0, maximum: 100 },
      },
    },
    verificationSteps: [
      {
        name: 'All tests pass',
        type: 'automated_test',
        config: { requireZeroFailures: true },
        required: true,
        timeout: 600000,
      },
    ],
    description: 'Validates that all tests pass with acceptable coverage.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'zionx-gate-review-complete',
    workflowType: 'gate-review',
    version: '1.0.0',
    outputSchema: {
      type: 'object',
      required: ['gateResults', 'allPassed'],
      properties: {
        gateResults: {
          type: 'array',
          items: {
            type: 'object',
            required: ['gateId', 'gateName', 'passed', 'details'],
            properties: {
              gateId: { type: 'string' },
              gateName: { type: 'string' },
              passed: { type: 'boolean' },
              details: { type: 'string' },
            },
          },
        },
        allPassed: { type: 'boolean' },
      },
    },
    verificationSteps: [
      {
        name: 'All gates pass',
        type: 'schema_validation',
        config: { requireAllPassed: true },
        required: true,
        timeout: 120000,
      },
    ],
    description: 'Validates that all submission gate checks passed.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'zionx-submission-complete',
    workflowType: 'submission',
    version: '1.0.0',
    outputSchema: {
      type: 'object',
      required: ['submissionId', 'platform', 'status'],
      properties: {
        submissionId: { type: 'string' },
        platform: { type: 'string', enum: ['apple', 'google'] },
        status: { type: 'string' },
        submittedAt: { type: 'string' },
      },
    },
    verificationSteps: [
      {
        name: 'Store acknowledged submission',
        type: 'external_check',
        config: { checkStoreStatus: true },
        required: true,
        timeout: 60000,
      },
    ],
    description: 'Validates that the app was successfully submitted to the store.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'zionx-marketing-complete',
    workflowType: 'marketing',
    version: '1.0.0',
    outputSchema: {
      type: 'object',
      required: ['campaignsLaunched', 'asoOptimized', 'landingPageUrl'],
      properties: {
        campaignsLaunched: { type: 'number', minimum: 1 },
        asoOptimized: { type: 'boolean' },
        landingPageUrl: { type: 'string' },
        adCampaignIds: { type: 'array', items: { type: 'string' } },
        socialCampaignIds: { type: 'array', items: { type: 'string' } },
      },
    },
    verificationSteps: [
      {
        name: 'At least one campaign active',
        type: 'schema_validation',
        config: { requireActiveCampaign: true },
        required: true,
        timeout: 120000,
      },
    ],
    description: 'Validates that GTM campaigns have been launched for the app.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'zionx-revenue-optimization-complete',
    workflowType: 'revenue-optimizing',
    version: '1.0.0',
    outputSchema: {
      type: 'object',
      required: ['metricsAnalyzed', 'recommendations'],
      properties: {
        metricsAnalyzed: { type: 'boolean' },
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'description'],
            properties: {
              type: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        revenueChange: { type: 'number' },
        optimizationsApplied: { type: 'number' },
      },
    },
    verificationSteps: [
      {
        name: 'Metrics analyzed',
        type: 'schema_validation',
        config: { requireMetricsAnalysis: true },
        required: true,
        timeout: 120000,
      },
    ],
    description: 'Validates that revenue optimization analysis has been performed.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
];

// ---------------------------------------------------------------------------
// ZionX Agent Program
// ---------------------------------------------------------------------------

export const ZIONX_AGENT_PROGRAM: AgentProgram = {
  id: 'zionx-app-factory',
  name: 'ZionX App Factory',
  version: '2.0.0',
  pillar: 'eretz',

  systemPrompt: `You are the ZionX App Factory agent. Your mission is to autonomously build, test, submit, and MARKET mobile applications to the Apple App Store and Google Play Store. You follow a strict lifecycle: ideation → market-research → development → testing → gate-review → submission → in-review → approved/rejected → live → marketing → revenue-optimizing → deprecated. You must pass all gate checks before submission, learn from any rejections to prevent recurrence, and drive revenue through the GTM engine after launch. Every app must have a marketing strategy — building without marketing is building to fail.`,

  tools: [
    {
      name: 'generate_code',
      description: 'Generate application source code using LLM',
      inputSchema: {
        type: 'object',
        required: ['appSpec', 'platform'],
        properties: {
          appSpec: { type: 'object' },
          platform: { type: 'string', enum: ['ios', 'android'] },
        },
      },
    },
    {
      name: 'compile_app',
      description: 'Trigger compilation of generated source code',
      inputSchema: {
        type: 'object',
        required: ['sourcePath', 'platform'],
        properties: {
          sourcePath: { type: 'string' },
          platform: { type: 'string', enum: ['ios', 'android'] },
        },
      },
    },
    {
      name: 'run_tests',
      description: 'Execute test suite against compiled app',
      inputSchema: {
        type: 'object',
        required: ['appPath', 'platform'],
        properties: {
          appPath: { type: 'string' },
          platform: { type: 'string', enum: ['ios', 'android'] },
        },
      },
    },
    {
      name: 'submit_to_store',
      description: 'Submit app to Apple App Store or Google Play Store',
      inputSchema: {
        type: 'object',
        required: ['appPath', 'platform', 'metadata'],
        properties: {
          appPath: { type: 'string' },
          platform: { type: 'string', enum: ['apple', 'google'] },
          metadata: { type: 'object' },
        },
      },
    },
    {
      name: 'check_review_status',
      description: 'Check the review status of a submitted app',
      inputSchema: {
        type: 'object',
        required: ['submissionId', 'platform'],
        properties: {
          submissionId: { type: 'string' },
          platform: { type: 'string', enum: ['apple', 'google'] },
        },
      },
    },
    {
      name: 'research_market',
      description: 'Analyze app market niche for viability and competition',
      inputSchema: {
        type: 'object',
        required: ['niche', 'category'],
        properties: {
          niche: { type: 'string' },
          category: { type: 'string' },
        },
      },
    },
    {
      name: 'optimize_aso',
      description: 'Run ASO optimization for an app listing',
      inputSchema: {
        type: 'object',
        required: ['appId', 'platform'],
        properties: {
          appId: { type: 'string' },
          platform: { type: 'string', enum: ['apple', 'google'] },
        },
      },
    },
    {
      name: 'launch_campaign',
      description: 'Launch a marketing campaign across social media or paid ads',
      inputSchema: {
        type: 'object',
        required: ['appId', 'campaignType', 'platforms'],
        properties: {
          appId: { type: 'string' },
          campaignType: { type: 'string', enum: ['social', 'paid', 'cross_promo'] },
          platforms: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'generate_landing_page',
      description: 'Generate a conversion-optimized landing page for an app',
      inputSchema: {
        type: 'object',
        required: ['appId', 'appName'],
        properties: {
          appId: { type: 'string' },
          appName: { type: 'string' },
        },
      },
    },
    {
      name: 'analyze_revenue',
      description: 'Analyze app revenue metrics and generate optimization recommendations',
      inputSchema: {
        type: 'object',
        required: ['appId'],
        properties: {
          appId: { type: 'string' },
          dateRange: { type: 'object' },
        },
      },
    },
    {
      name: 'manage_portfolio',
      description: 'Get portfolio health dashboard and recommendations',
      inputSchema: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
        },
      },
    },
  ],

  stateMachine: ZIONX_STATE_MACHINE,
  completionContracts: ZIONX_COMPLETION_CONTRACTS,

  authorityLevel: 'L4',
  allowedActions: [
    'generate_code',
    'compile_app',
    'run_tests',
    'run_gate_checks',
    'submit_to_store',
    'check_review_status',
    'parse_rejection',
    'create_remediation_plan',
    'research_market',
    'optimize_aso',
    'launch_campaign',
    'generate_landing_page',
    'analyze_revenue',
    'manage_portfolio',
    'adjust_ad_bids',
    'cross_promote',
    'generate_re_engagement_plan',
  ],
  deniedActions: [
    'delete_live_app',
    'modify_financial_data',
    'access_other_pillars',
    'exceed_ad_budget',
  ],

  modelPreference: {
    preferred: 'claude-sonnet-4-20250514',
    fallback: 'gpt-4o',
    costCeiling: 5.0,
    taskTypeOverrides: {
      code_generation: 'claude-sonnet-4-20250514',
      analysis: 'gpt-4o',
      classification: 'gpt-4o-mini',
      creative: 'claude-sonnet-4-20250514',
      market_research: 'gpt-4o',
    },
  },

  tokenBudget: { daily: 500000, monthly: 10000000 },

  testSuite: {
    suiteId: 'zionx-test-suite',
    path: 'packages/app/src/zionx/__tests__',
    requiredCoverage: 80,
  },

  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-15T00:00:00Z'),
  createdBy: 'system',
  changelog: [
    {
      version: '1.0.0',
      date: new Date('2026-01-01T00:00:00Z'),
      author: 'system',
      description: 'Initial ZionX App Factory agent program definition.',
    },
    {
      version: '2.0.0',
      date: new Date('2026-01-15T00:00:00Z'),
      author: 'system',
      description:
        'Added market-research, marketing, and revenue-optimizing states. Integrated full GTM engine with ASO, campaign management, landing pages, revenue optimization, and portfolio management.',
    },
  ],
};

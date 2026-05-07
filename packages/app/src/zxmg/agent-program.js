"use strict";
/**
 * ZXMG Media Production — Agent Program Definition
 *
 * Defines the ZXMG agent program with a state machine for the content
 * lifecycle: planning → script-generation → asset-creation → video-assembly →
 * metadata-prep → platform-upload → published → monitoring.
 *
 * Authority level L4 (autonomous within bounds).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZXMG_AGENT_PROGRAM = exports.ZXMG_COMPLETION_CONTRACTS = exports.ZXMG_STATE_MACHINE = void 0;
// ---------------------------------------------------------------------------
// ZXMG State Machine Definition
// ---------------------------------------------------------------------------
exports.ZXMG_STATE_MACHINE = {
    id: 'zxmg-content-lifecycle',
    name: 'ZXMG Content Lifecycle',
    version: '1.0.0',
    states: {
        planning: {
            name: 'planning',
            type: 'initial',
            onEnter: [{ type: 'log', config: { message: 'Content planning phase started' } }],
        },
        'script-generation': {
            name: 'script-generation',
            type: 'active',
            onEnter: [{ type: 'notify', config: { message: 'Script generation started' } }],
            timeout: { duration: 3600000, transitionTo: 'planning' }, // 1h timeout
        },
        'asset-creation': {
            name: 'asset-creation',
            type: 'active',
            onEnter: [{ type: 'notify', config: { message: 'Media asset creation started' } }],
            timeout: { duration: 7200000, transitionTo: 'script-generation' }, // 2h timeout
        },
        'video-assembly': {
            name: 'video-assembly',
            type: 'active',
            onEnter: [{ type: 'notify', config: { message: 'Video assembly in progress' } }],
            timeout: { duration: 3600000, transitionTo: 'asset-creation' }, // 1h timeout
        },
        'metadata-prep': {
            name: 'metadata-prep',
            type: 'active',
            onEnter: [{ type: 'notify', config: { message: 'Metadata preparation started' } }],
        },
        'platform-upload': {
            name: 'platform-upload',
            type: 'active',
            onEnter: [{ type: 'notify', config: { message: 'Uploading to platforms' } }],
            timeout: { duration: 1800000, transitionTo: 'metadata-prep' }, // 30m timeout
        },
        published: {
            name: 'published',
            type: 'active',
            onEnter: [{ type: 'notify', config: { message: 'Content published successfully' } }],
        },
        monitoring: {
            name: 'monitoring',
            type: 'active',
            onEnter: [{ type: 'notify', config: { message: 'Performance monitoring active' } }],
        },
        archived: {
            name: 'archived',
            type: 'terminal',
            onEnter: [{ type: 'log', config: { message: 'Content archived' } }],
        },
    },
    initialState: 'planning',
    terminalStates: ['archived'],
    transitions: [
        {
            from: 'planning',
            to: 'script-generation',
            event: 'start_script',
            gates: [
                {
                    id: 'gate-content-brief',
                    name: 'Content Brief Defined',
                    type: 'validation',
                    config: { requiresContentBrief: true },
                    required: true,
                },
            ],
            actions: [{ type: 'trigger_pipeline', config: { stage: 'script_generation' } }],
        },
        {
            from: 'script-generation',
            to: 'asset-creation',
            event: 'script_approved',
            gates: [
                {
                    id: 'gate-script-quality',
                    name: 'Script Quality Check',
                    type: 'validation',
                    config: { minimumQualityScore: 70 },
                    required: true,
                },
            ],
            actions: [{ type: 'trigger_pipeline', config: { stage: 'asset_creation' } }],
        },
        {
            from: 'script-generation',
            to: 'planning',
            event: 'script_rejected',
            gates: [],
            actions: [{ type: 'log', config: { message: 'Script rejected, returning to planning' } }],
        },
        {
            from: 'asset-creation',
            to: 'video-assembly',
            event: 'assets_ready',
            gates: [
                {
                    id: 'gate-assets-complete',
                    name: 'All Assets Created',
                    type: 'validation',
                    config: { requiresAllAssets: true },
                    required: true,
                },
            ],
        },
        {
            from: 'video-assembly',
            to: 'metadata-prep',
            event: 'video_assembled',
            gates: [
                {
                    id: 'gate-video-quality',
                    name: 'Video Quality Check',
                    type: 'validation',
                    config: { minimumResolution: '1080p' },
                    required: true,
                },
            ],
        },
        {
            from: 'metadata-prep',
            to: 'platform-upload',
            event: 'metadata_ready',
            gates: [
                {
                    id: 'gate-metadata-complete',
                    name: 'Metadata Complete',
                    type: 'validation',
                    config: { requiresTitle: true, requiresDescription: true, requiresThumbnail: true },
                    required: true,
                },
            ],
        },
        {
            from: 'platform-upload',
            to: 'published',
            event: 'upload_complete',
            gates: [],
        },
        {
            from: 'platform-upload',
            to: 'metadata-prep',
            event: 'upload_failed',
            gates: [],
            actions: [{ type: 'log', config: { message: 'Upload failed, returning to metadata prep' } }],
        },
        {
            from: 'published',
            to: 'monitoring',
            event: 'start_monitoring',
            gates: [],
        },
        {
            from: 'monitoring',
            to: 'published',
            event: 'monitoring_cycle_complete',
            gates: [],
        },
        {
            from: 'published',
            to: 'archived',
            event: 'archive_content',
            gates: [
                {
                    id: 'gate-archive-approval',
                    name: 'Archive Approval',
                    type: 'approval',
                    config: { requiresAuthorityLevel: 'L3' },
                    required: true,
                },
            ],
        },
        {
            from: 'monitoring',
            to: 'archived',
            event: 'archive_content',
            gates: [
                {
                    id: 'gate-archive-approval-monitoring',
                    name: 'Archive Approval',
                    type: 'approval',
                    config: { requiresAuthorityLevel: 'L3' },
                    required: true,
                },
            ],
        },
    ],
    metadata: {
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-15T00:00:00Z'),
        description: 'ZXMG Media Production lifecycle — manages content from planning through script generation, asset creation, video assembly, platform upload, and performance monitoring.',
    },
};
// ---------------------------------------------------------------------------
// Completion Contracts
// ---------------------------------------------------------------------------
exports.ZXMG_COMPLETION_CONTRACTS = [
    {
        id: 'zxmg-script-generation-complete',
        workflowType: 'script-generation',
        version: '1.0.0',
        outputSchema: {
            type: 'object',
            required: ['script', 'duration', 'platform'],
            properties: {
                script: { type: 'string' },
                duration: { type: 'number', minimum: 1 },
                platform: { type: 'string' },
                hooks: { type: 'array', items: { type: 'string' } },
            },
        },
        verificationSteps: [
            {
                name: 'Script quality check',
                type: 'schema_validation',
                config: { minimumQualityScore: 70 },
                required: true,
                timeout: 60000,
            },
        ],
        description: 'Validates that script generation produced a quality script.',
        createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
        id: 'zxmg-video-assembly-complete',
        workflowType: 'video-assembly',
        version: '1.0.0',
        outputSchema: {
            type: 'object',
            required: ['videoPath', 'format', 'resolution', 'durationSeconds'],
            properties: {
                videoPath: { type: 'string' },
                format: { type: 'string' },
                resolution: { type: 'string' },
                durationSeconds: { type: 'number', minimum: 1 },
            },
        },
        verificationSteps: [
            {
                name: 'Video format validation',
                type: 'automated_test',
                config: { checkFormat: true },
                required: true,
                timeout: 120000,
            },
        ],
        description: 'Validates that video assembly produced a valid video file.',
        createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
        id: 'zxmg-upload-complete',
        workflowType: 'platform-upload',
        version: '1.0.0',
        outputSchema: {
            type: 'object',
            required: ['platformId', 'uploadStatus', 'contentUrl'],
            properties: {
                platformId: { type: 'string' },
                uploadStatus: { type: 'string', enum: ['success', 'processing'] },
                contentUrl: { type: 'string' },
                videoId: { type: 'string' },
            },
        },
        verificationSteps: [
            {
                name: 'Upload confirmation',
                type: 'external_check',
                config: { checkPlatformStatus: true },
                required: true,
                timeout: 60000,
            },
        ],
        description: 'Validates that content was successfully uploaded to the platform.',
        createdAt: new Date('2026-01-01T00:00:00Z'),
    },
];
// ---------------------------------------------------------------------------
// ZXMG Agent Program
// ---------------------------------------------------------------------------
exports.ZXMG_AGENT_PROGRAM = {
    id: 'zxmg-media-production',
    name: 'ZXMG Media Production',
    version: '1.0.0',
    pillar: 'eretz',
    systemPrompt: `You are the ZXMG Media Production agent. Your mission is to autonomously produce, publish, and monitor video content across YouTube, TikTok, Instagram Reels, and other platforms. You follow a strict content lifecycle: planning → script-generation → asset-creation → video-assembly → metadata-prep → platform-upload → published → monitoring. You generate scripts via LLM, create video assets via HeyGen, assemble final videos, prepare platform-specific metadata, upload to target platforms, and monitor performance metrics.`,
    tools: [
        {
            name: 'generate_script',
            description: 'Generate a video script using LLM',
            inputSchema: {
                type: 'object',
                required: ['topic', 'platform', 'duration'],
                properties: {
                    topic: { type: 'string' },
                    platform: { type: 'string' },
                    duration: { type: 'number' },
                },
            },
        },
        {
            name: 'create_video_asset',
            description: 'Create a video asset using HeyGen',
            inputSchema: {
                type: 'object',
                required: ['script', 'avatarId'],
                properties: {
                    script: { type: 'string' },
                    avatarId: { type: 'string' },
                },
            },
        },
        {
            name: 'upload_content',
            description: 'Upload content to a platform',
            inputSchema: {
                type: 'object',
                required: ['videoPath', 'platform', 'metadata'],
                properties: {
                    videoPath: { type: 'string' },
                    platform: { type: 'string' },
                    metadata: { type: 'object' },
                },
            },
        },
        {
            name: 'get_analytics',
            description: 'Get content performance analytics',
            inputSchema: {
                type: 'object',
                required: ['contentId', 'platform'],
                properties: {
                    contentId: { type: 'string' },
                    platform: { type: 'string' },
                },
            },
        },
    ],
    stateMachine: exports.ZXMG_STATE_MACHINE,
    completionContracts: exports.ZXMG_COMPLETION_CONTRACTS,
    authorityLevel: 'L4',
    allowedActions: [
        'generate_script',
        'create_video_asset',
        'assemble_video',
        'prepare_metadata',
        'upload_content',
        'get_analytics',
        'schedule_publish',
        'reply_to_comment',
    ],
    deniedActions: [
        'delete_published_content',
        'modify_financial_data',
        'access_other_pillars',
    ],
    modelPreference: {
        preferred: 'claude-sonnet-4-20250514',
        fallback: 'gpt-4o',
        costCeiling: 3.0,
        taskTypeOverrides: {
            creative: 'claude-sonnet-4-20250514',
            analysis: 'gpt-4o-mini',
            classification: 'gpt-4o-mini',
        },
    },
    tokenBudget: { daily: 200000, monthly: 4000000 },
    testSuite: {
        suiteId: 'zxmg-test-suite',
        path: 'packages/app/src/zxmg/__tests__',
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
            description: 'Initial ZXMG Media Production agent program definition.',
        },
    ],
};
//# sourceMappingURL=agent-program.js.map
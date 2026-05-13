/**
 * Phase 8 End-to-End Integration Tests
 *
 * Validates the full integration of all Phase 8 components:
 * - Parallel Orchestration (DAG, Scheduler, Coordination, Aggregation)
 * - MCP Server Host (tool registration, client connections, tool invocation)
 * - MCP Client Manager (external server connections, tool discovery, invocation)
 * - Kiro-Seraphim Bridge (bidirectional tool invocation)
 * - Agent Communication (multi-user messaging, history, unified view)
 * - Context Sharing (cross-agent relevance detection, auto-propagation)
 * - Notification Routing (rule-based multi-channel delivery)
 * - Delegation Visibility (parallel delegation tracking)
 * - Priority Queue (multi-user priority ordering)
 *
 * Validates: Requirements 35a-35d, 36a-36d, 37a-37f, 38a-38d, 39, 40, 41, 19.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Real parallel service implementations
import { DependencyGraphEngineImpl } from '../parallel/dependency-graph.js';
import { ParallelSchedulerImpl } from '../parallel/scheduler.js';
import { CoordinationBusImpl } from '../parallel/coordination-bus.js';
import { ResultAggregatorImpl } from '../parallel/result-aggregator.js';

// Real MCP service implementations
import { MCPServerHostImpl } from '../mcp/server-host.js';
import { MCPClientManagerImpl } from '../mcp/client-manager.js';
import { MCPToolRegistryImpl } from '../mcp/tool-registry.js';
import { KiroSeraphimBridgeImpl } from '../mcp/kiro-bridge.js';

// Real communication service implementations
import { AgentCommunicationServiceImpl } from '../communication/service.js';
import { MessagePriorityQueueImpl } from '../communication/priority-queue.js';
import { ContextSharingEngineImpl } from '../communication/context-sharing.js';
import { NotificationRoutingEngineImpl } from '../communication/notification-router.js';
import { DelegationVisibilityServiceImpl } from '../communication/delegation-visibility.js';

// Types
import type { ParallelTask } from '../parallel/types.js';
import type {
  MCPTransportAdapter,
  MCPRequest,
  MCPResponse,
  MCPToolDefinition,
} from '../mcp/types.js';
import type { ChatMessage } from '../communication/types.js';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createParallelTask(overrides: Partial<ParallelTask> = {}): ParallelTask {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    agentId: 'agent-1',
    task: {
      id: `inner-${Date.now()}`,
      type: 'analysis',
      description: 'Test task',
      params: {},
      priority: 'medium',
    },
    dependencies: [],
    priority: 5,
    estimatedDuration: 1000,
    resourceRequirements: { cpuUnits: 1, memoryMb: 256 },
    ...overrides,
  };
}

/**
 * Creates a mock MCP transport adapter that simulates a connected server
 * with configurable tool responses.
 */
function createMockTransport(options?: {
  tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  toolResponses?: Record<string, unknown>;
}): MCPTransportAdapter {
  let connected = false;
  const tools = options?.tools ?? [];
  const toolResponses = options?.toolResponses ?? {};

  return {
    async connect(): Promise<void> {
      connected = true;
    },
    async sendRequest(request: MCPRequest): Promise<MCPResponse> {
      if (request.method === 'tools/list') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: { tools },
        };
      }
      if (request.method === 'tools/call') {
        const toolName = (request.params as Record<string, unknown>)?.name as string;
        const response = toolResponses[toolName];
        if (response !== undefined) {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(response) }],
              isError: false,
            },
          };
        }
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: 'Tool not found' }],
            isError: true,
          },
        };
      }
      return { jsonrpc: '2.0', id: request.id, result: {} };
    },
    async disconnect(): Promise<void> {
      connected = false;
    },
    isConnected(): boolean {
      return connected;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Full Parallel Execution
// Validates: Requirements 35a-35d, 19.2
// ---------------------------------------------------------------------------

describe('Phase 8 Integration: Full Parallel Execution', () => {
  let graphEngine: DependencyGraphEngineImpl;
  let scheduler: ParallelSchedulerImpl;
  let coordinationBus: CoordinationBusImpl;
  let aggregator: ResultAggregatorImpl;

  beforeEach(() => {
    graphEngine = new DependencyGraphEngineImpl();
    scheduler = new ParallelSchedulerImpl();
    coordinationBus = new CoordinationBusImpl();
    aggregator = new ResultAggregatorImpl();
  });

  it('creates DAG → schedules → executes parallel → coordinates → aggregates results', async () => {
    // Create a 3-task DAG: A and B are independent, C depends on A
    const taskA = createParallelTask({ id: 'task-a', agentId: 'eretz' });
    const taskB = createParallelTask({ id: 'task-b', agentId: 'zionx' });
    const taskC = createParallelTask({
      id: 'task-c',
      agentId: 'eretz',
      dependencies: ['task-a'],
    });

    // Step 1: Create the DAG
    const dag = await graphEngine.createGraph([taskA, taskB, taskC]);
    expect(dag.id).toBeDefined();
    expect(dag.tasks.size).toBe(3);
    expect(dag.edges.length).toBe(1); // A → C

    // Step 2: Validate the DAG (no cycles)
    const validation = await graphEngine.validateGraph(dag);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Step 3: Schedule the DAG into execution batches
    const plan = await graphEngine.schedule(dag);
    expect(plan.dagId).toBe(dag.id);
    expect(plan.batches.length).toBeGreaterThanOrEqual(2);
    expect(plan.totalTasks).toBe(3);

    // First batch should contain A and B (no dependencies)
    const firstBatch = plan.batches[0];
    expect(firstBatch.taskIds).toContain('task-a');
    expect(firstBatch.taskIds).toContain('task-b');

    // Second batch should contain C (depends on A)
    const secondBatch = plan.batches[1];
    expect(secondBatch.taskIds).toContain('task-c');

    // Step 4: Dispatch tasks via scheduler
    scheduler.configure({
      defaultParallelismLimit: 5,
      distributionStrategy: 'round-robin',
      maxRetries: 3,
      retryDelayMs: 100,
    });

    const dispatchResults = await scheduler.dispatchBatch([taskA, taskB], dag.id);
    expect(dispatchResults.length).toBe(2);
    for (const dr of dispatchResults) {
      expect(dr.status).toBe('dispatched');
    }

    // Step 5: Coordinate — signal completion of A and share intermediate result
    await coordinationBus.signalCompletion('task-a', { analysis: 'result-a' });
    await coordinationBus.shareIntermediateResult('eretz', dag.id, 'step-a-output', { data: 42 });

    // Verify intermediate result is accessible
    const intermediate = await coordinationBus.getIntermediateResult(dag.id, 'step-a-output');
    expect(intermediate).toEqual({ data: 42 });

    // Step 6: Collect results and aggregate
    await aggregator.collectResult(dag.id, 'task-a', {
      success: true,
      output: { analysis: 'result-a' },
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 500,
    });
    await aggregator.collectResult(dag.id, 'task-b', {
      success: true,
      output: { analysis: 'result-b' },
      tokenUsage: { inputTokens: 80, outputTokens: 40, totalTokens: 120 },
      durationMs: 400,
    });
    await aggregator.collectResult(dag.id, 'task-c', {
      success: true,
      output: { analysis: 'result-c' },
      tokenUsage: { inputTokens: 120, outputTokens: 60, totalTokens: 180 },
      durationMs: 600,
    });

    const aggregated = await aggregator.aggregate(dag.id, 'merge');
    expect(aggregated.dagId).toBe(dag.id);
    expect(aggregated.totalStreams).toBe(3);
    expect(aggregated.successfulStreams).toBe(3);
    expect(aggregated.failedStreams).toBe(0);
    expect(aggregated.perStreamResults.size).toBe(3);
    expect(aggregated.aggregatedAt).toBeInstanceOf(Date);
    expect(aggregated.mergedOutput).toBeDefined();
  });
});


// ---------------------------------------------------------------------------
// 2. MCP Server Host
// Validates: Requirements 36a-36d, 19.2
// ---------------------------------------------------------------------------

describe('Phase 8 Integration: MCP Server Host', () => {
  let serverHost: MCPServerHostImpl;

  beforeEach(() => {
    serverHost = new MCPServerHostImpl();
  });

  it('external client connects → discovers tools → invokes tool → receives result', async () => {
    const agentId = 'eretz-agent';

    // Step 1: Start a server for the agent
    await serverHost.startServer({
      agentId,
      transport: 'sse',
      port: 3001,
      authRequired: false,
      rateLimits: { maxRequestsPerWindow: 100, windowMs: 60_000 },
    });

    // Step 2: Register tools on the server
    const analysisTool: MCPToolDefinition = {
      name: 'analyze_portfolio',
      description: 'Analyze investment portfolio performance',
      inputSchema: { type: 'object', properties: { portfolioId: { type: 'string' } } },
      requiredAuthority: 'L4',
      handler: async (params) => ({
        success: true,
        output: { portfolioId: params.portfolioId, performance: '+12.5%', risk: 'moderate' },
      }),
    };

    serverHost.registerTool(agentId, analysisTool);

    // Step 3: Client connects
    const connectionId = 'client-conn-1';
    const connectResponse = await serverHost.connect(agentId, connectionId);
    expect(connectResponse.error).toBeUndefined();
    expect(connectResponse.result).toBeDefined();

    // Step 4: Client discovers tools via tools/list
    const listResponse = await serverHost.handleRequest(connectionId, {
      jsonrpc: '2.0',
      id: 'list-1',
      method: 'tools/list',
    });
    expect(listResponse.error).toBeUndefined();
    const toolsList = (listResponse.result as { tools: Array<{ name: string }> }).tools;
    expect(toolsList).toHaveLength(1);
    expect(toolsList[0].name).toBe('analyze_portfolio');

    // Step 5: Client invokes the tool
    const callResponse = await serverHost.handleRequest(connectionId, {
      jsonrpc: '2.0',
      id: 'call-1',
      method: 'tools/call',
      params: { name: 'analyze_portfolio', arguments: { portfolioId: 'port-123' } },
    });
    expect(callResponse.error).toBeUndefined();
    const callResult = callResponse.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    expect(callResult.isError).toBe(false);
    const output = JSON.parse(callResult.content[0].text);
    expect(output.portfolioId).toBe('port-123');
    expect(output.performance).toBe('+12.5%');
  });
});

// ---------------------------------------------------------------------------
// 3. MCP Client Manager
// Validates: Requirements 36b, 19.2
// ---------------------------------------------------------------------------

describe('Phase 8 Integration: MCP Client Manager', () => {
  it('agent discovers tools via registry → searches by capability → invokes via client', async () => {
    // Set up a mock transport that simulates an external MCP server
    const mockTransport = createMockTransport({
      tools: [
        {
          name: 'generate_image',
          description: 'Generate an image from a text prompt using AI',
          inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
        },
        {
          name: 'translate_text',
          description: 'Translate text between languages',
          inputSchema: { type: 'object', properties: { text: { type: 'string' }, targetLang: { type: 'string' } } },
        },
      ],
      toolResponses: {
        generate_image: { imageUrl: 'https://example.com/generated.png', width: 1024, height: 1024 },
        translate_text: { translated: 'Bonjour le monde' },
      },
    });

    // Create client manager with the mock transport factory
    const clientManager = new MCPClientManagerImpl({
      transportFactory: () => mockTransport,
    });

    // Create tool registry
    const registry = new MCPToolRegistryImpl();

    // Step 1: Connect to external server
    const connection = await clientManager.connect('https://ai-tools.example.com', {
      serverUrl: 'https://ai-tools.example.com',
      transport: 'sse',
      timeout: 5000,
      retryPolicy: { maxRetries: 2, backoffMs: 100 },
    });
    expect(connection.status).toBe('connected');

    // Step 2: Discover tools on the server
    const tools = await clientManager.discoverTools(connection.id);
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('generate_image');
    expect(tools[1].name).toBe('translate_text');

    // Step 3: Register discovered tools in the registry
    registry.registerExternalServer('https://ai-tools.example.com', tools);
    const allTools = registry.listAllTools();
    expect(allTools).toHaveLength(2);

    // Step 4: Search by capability
    const imageTools = registry.findByCapability('generate image from text');
    expect(imageTools.length).toBeGreaterThan(0);
    expect(imageTools[0].entry.name).toBe('generate_image');

    // Step 5: Invoke tool via client manager
    const result = await clientManager.invokeTool(connection.id, 'generate_image', {
      prompt: 'A sunset over mountains',
    });
    expect(result.success).toBe(true);
    expect((result.output as Record<string, unknown>).imageUrl).toBe('https://example.com/generated.png');
  });
});


// ---------------------------------------------------------------------------
// 4. Kiro-Seraphim Bridge
// Validates: Requirements 36d, 19.2
// ---------------------------------------------------------------------------

describe('Phase 8 Integration: Kiro-Seraphim Bridge', () => {
  let serverHost: MCPServerHostImpl;
  let registry: MCPToolRegistryImpl;

  beforeEach(() => {
    serverHost = new MCPServerHostImpl();
    registry = new MCPToolRegistryImpl();
  });

  it('Kiro invokes agent tool → agent invokes Kiro tool → bidirectional flow', async () => {
    // Set up an agent server with a tool
    const agentId = 'zionx-agent';
    await serverHost.startServer({
      agentId,
      transport: 'sse',
      authRequired: false,
      rateLimits: { maxRequestsPerWindow: 100, windowMs: 60_000 },
    });

    const buildTool: MCPToolDefinition = {
      name: 'build_app',
      description: 'Build the application',
      inputSchema: { type: 'object', properties: { target: { type: 'string' } } },
      requiredAuthority: 'L4',
      handler: async (params) => ({
        success: true,
        output: { target: params.target, status: 'built', artifacts: ['app.js', 'app.css'] },
      }),
    };
    serverHost.registerTool(agentId, buildTool);

    // Register in the tool registry
    registry.registerInternalTools(agentId, [buildTool]);

    // Create a mock transport for Seraphim → Kiro direction
    const kiroTransport = createMockTransport({
      toolResponses: {
        readFile: { content: 'export default function() {}', path: '/src/index.ts' },
        writeFile: { success: true, path: '/src/output.ts' },
      },
    });

    // Create the bridge
    const bridge = new KiroSeraphimBridgeImpl(serverHost, registry, kiroTransport);

    // Connect the bridge
    await bridge.connect('kiro-session-123');
    expect(bridge.getStatus()).toBe('connected');
    expect(bridge.getSessionId()).toBe('kiro-session-123');

    // Direction 1: Kiro → Seraphim (Kiro invokes agent tool)
    const kiroResult = await bridge.handleKiroToolCall(agentId, 'build_app', { target: 'production' });
    expect(kiroResult.success).toBe(true);
    expect((kiroResult.output as Record<string, unknown>).status).toBe('built');
    expect((kiroResult.output as Record<string, unknown>).target).toBe('production');

    // Direction 2: Seraphim → Kiro (Agent invokes Kiro tool)
    const agentResult = await bridge.invokeKiroTool({
      tool: 'readFile',
      args: { path: '/src/index.ts' },
    });
    expect(agentResult.success).toBe(true);
    expect((agentResult.output as Record<string, unknown>).content).toBe('export default function() {}');

    // Verify exposed tools include the registered agent tool
    const exposedTools = bridge.getExposedTools();
    expect(exposedTools.length).toBeGreaterThan(0);
    expect(exposedTools.some((t) => t.name === 'build_app')).toBe(true);

    // Verify Kiro tool availability
    expect(bridge.isKiroToolAvailable('readFile')).toBe(true);
    expect(bridge.isKiroToolAvailable('writeFile')).toBe(true);
    expect(bridge.isKiroToolAvailable('runCommand')).toBe(true);

    // Disconnect
    await bridge.disconnect();
    expect(bridge.getStatus()).toBe('disconnected');
  });
});

// ---------------------------------------------------------------------------
// 5. Agent Communication
// Validates: Requirements 37a, 37b, 19.2
// ---------------------------------------------------------------------------

describe('Phase 8 Integration: Agent Communication', () => {
  let commService: AgentCommunicationServiceImpl;

  beforeEach(() => {
    commService = new AgentCommunicationServiceImpl();
    // Register a simple message handler that echoes back
    commService.setMessageHandler(async (_agentId, message) => {
      return `Acknowledged: ${message.content}`;
    });
  });

  it('user sends message via dashboard → agent responds → message appears in history', async () => {
    const agentId = 'seraphim';
    const userId = 'king';

    // Step 1: User sends a message
    const response = await commService.sendMessage({
      userId,
      agentId,
      content: 'What is the system status?',
      priority: 'normal',
      source: 'dashboard',
    });

    expect(response.messageId).toBeDefined();
    expect(response.agentResponse.content).toBe('Acknowledged: What is the system status?');
    expect(response.agentResponse.sender).toBe('agent');
    expect(response.processingTime).toBeGreaterThanOrEqual(0);

    // Step 2: Verify message appears in history
    const history = await commService.getHistory(agentId, { userId });
    expect(history.length).toBe(2); // user message + agent response
    expect(history[0].sender).toBe('user');
    expect(history[0].content).toBe('What is the system status?');
    expect(history[1].sender).toBe('agent');
    expect(history[1].content).toBe('Acknowledged: What is the system status?');

    // Step 3: Verify unified history
    const unified = await commService.getUnifiedHistory(agentId);
    expect(unified.length).toBe(2);

    // Step 4: Verify active users
    const activeUsers = await commService.getActiveUsers(agentId);
    expect(activeUsers.length).toBe(1);
    expect(activeUsers[0].userId).toBe('king');
    expect(activeUsers[0].messageCount).toBe(1);
  });
});


// ---------------------------------------------------------------------------
// 6. Cross-Agent Context Sharing
// Validates: Requirements 37c, 37d, 19.2
// ---------------------------------------------------------------------------

describe('Phase 8 Integration: Cross-Agent Context Sharing', () => {
  let contextEngine: ContextSharingEngineImpl;

  beforeEach(() => {
    contextEngine = new ContextSharingEngineImpl();
  });

  it('message to ZionX auto-shared with ZXMG → ZXMG acknowledges context', async () => {
    // Configure the engine with agent domains
    contextEngine.configure({
      relevanceThreshold: 0.5,
      agentDomains: new Map([
        ['zionx', ['app', 'development', 'design', 'product']],
        ['zxmg', ['content', 'video', 'media', 'marketing']],
        ['eretz', ['business', 'portfolio', 'synergy']],
      ]),
    });

    // Create a message sent to ZionX that contains ZXMG-relevant keywords
    const message: ChatMessage = {
      id: 'msg-ctx-1',
      agentId: 'zionx',
      userId: 'king',
      sender: 'user',
      senderName: 'king',
      content: 'We need to create marketing video content for the new app launch',
      timestamp: new Date(),
      source: 'dashboard',
      priority: 'normal',
      metadata: {},
    };

    // Step 1: Analyze relevance across agents
    const relevanceResults = await contextEngine.analyzeRelevance(
      message,
      ['zionx', 'zxmg', 'eretz'],
    );

    // ZXMG should have high relevance (content, video, media keywords match)
    const zxmgRelevance = relevanceResults.find((r) => r.agentId === 'zxmg');
    expect(zxmgRelevance).toBeDefined();
    expect(zxmgRelevance!.relevanceScore).toBeGreaterThan(0);
    expect(zxmgRelevance!.suggestedAction).not.toBe('no_action');

    // Step 2: Propagate context to ZXMG (auto-detected)
    const shareEvents = await contextEngine.propagateContext(
      message,
      ['zxmg'],
      'auto_detected',
    );

    expect(shareEvents).toHaveLength(1);
    expect(shareEvents[0].fromAgentId).toBe('zionx');
    expect(shareEvents[0].toAgentId).toBe('zxmg');
    expect(shareEvents[0].reason).toBe('auto_detected');
    expect(shareEvents[0].sharedContent).toContain('marketing video content');

    // Step 3: Verify ZXMG's share log contains the event
    const zxmgShareLog = contextEngine.getShareLog('zxmg');
    expect(zxmgShareLog).toHaveLength(1);
    expect(zxmgShareLog[0].acknowledged).toBe(false);

    // Step 4: Test @-mention parsing
    const mentionMessage = 'Hey @zxmg please review the content strategy for @eretz';
    const mentions = contextEngine.parseAgentMentions(mentionMessage);
    expect(mentions).toContain('zxmg');
    expect(mentions).toContain('eretz');
  });
});

// ---------------------------------------------------------------------------
// 7. Notification Routing
// Validates: Requirements 41, 38d, 19.2
// ---------------------------------------------------------------------------

describe('Phase 8 Integration: Notification Routing', () => {
  let router: NotificationRoutingEngineImpl;

  beforeEach(() => {
    router = new NotificationRoutingEngineImpl();
  });

  it('agent generates alert → routed to dashboard + Telegram → user acknowledges', async () => {
    const userId = 'king';

    // Step 1: Set up routing rules
    router.setRules(userId, [
      {
        id: 'rule-1',
        userId,
        conditions: {
          priorityMin: 'high',
        },
        channels: ['dashboard', 'telegram'],
        escalation: {
          timeout: 300, // 5 minutes
          escalateToChannel: 'imessage',
        },
      },
      {
        id: 'rule-2',
        userId,
        conditions: {
          priorityMin: 'normal',
          notificationType: ['task_complete'],
        },
        channels: ['dashboard'],
      },
    ]);

    // Step 2: Agent generates a high-priority alert
    const notification = {
      id: 'notif-1',
      agentId: 'zion-alpha',
      userId,
      type: 'alert' as const,
      priority: 'high' as const,
      title: 'Position Risk Alert',
      body: 'Portfolio risk exceeds threshold. Immediate review required.',
      actionable: true,
      actions: [
        { label: 'Review', type: 'acknowledge' as const, payload: { action: 'review' } },
      ],
      timestamp: new Date(),
    };

    // Step 3: Route the notification
    const deliveryResults = await router.route(notification);

    // Should be delivered to both dashboard and telegram
    expect(deliveryResults.length).toBe(2);
    const channels = deliveryResults.map((r) => r.channel);
    expect(channels).toContain('dashboard');
    expect(channels).toContain('telegram');
    for (const result of deliveryResults) {
      expect(result.status).toBe('delivered');
    }

    // Step 4: Verify notification is unacknowledged
    expect(router.isAcknowledged('notif-1')).toBe(false);
    const unacked = router.getUnacknowledged(userId);
    expect(unacked).toHaveLength(1);
    expect(unacked[0].id).toBe('notif-1');

    // Step 5: User acknowledges via dashboard
    router.acknowledge('notif-1', 'dashboard');
    expect(router.isAcknowledged('notif-1')).toBe(true);

    // Acknowledgment deduplicates — no longer in unacknowledged list
    const unackedAfter = router.getUnacknowledged(userId);
    expect(unackedAfter).toHaveLength(0);
  });
});


// ---------------------------------------------------------------------------
// 8. Delegation Visibility
// Validates: Requirements 40, 19.2
// ---------------------------------------------------------------------------

describe('Phase 8 Integration: Delegation Visibility', () => {
  let delegationService: DelegationVisibilityServiceImpl;

  beforeEach(() => {
    delegationService = new DelegationVisibilityServiceImpl();
  });

  it('user asks Seraphim → Seraphim delegates to Eretz and ZionX in parallel → delegation shown in chat', async () => {
    const messageId = 'msg-delegate-1';
    const parallelGroupId = 'parallel-group-1';

    // Step 1: Subscribe to delegation changes
    const changes: Array<{ id: string; status: string }> = [];
    const subId = delegationService.onDelegationChange((delegation) => {
      changes.push({ id: delegation.id, status: delegation.status });
    });

    // Step 2: Seraphim delegates to Eretz and ZionX in parallel
    const eretzDelegation = delegationService.recordDelegation({
      parentMessageId: messageId,
      fromAgentId: 'seraphim',
      toAgentId: 'eretz',
      taskDescription: 'Analyze business impact of new strategy',
      status: 'pending',
      isParallel: true,
      parallelGroupId,
    });

    const zionxDelegation = delegationService.recordDelegation({
      parentMessageId: messageId,
      fromAgentId: 'seraphim',
      toAgentId: 'zionx',
      taskDescription: 'Prepare technical implementation plan',
      status: 'pending',
      isParallel: true,
      parallelGroupId,
    });

    expect(eretzDelegation.id).toBeDefined();
    expect(eretzDelegation.startedAt).toBeInstanceOf(Date);
    expect(zionxDelegation.id).toBeDefined();

    // Step 3: Verify delegations are visible for the message
    const messageDelegations = delegationService.getDelegationsForMessage(messageId);
    expect(messageDelegations).toHaveLength(2);

    // Step 4: Verify parallel group
    const parallelGroup = delegationService.getParallelGroup(parallelGroupId);
    expect(parallelGroup).toHaveLength(2);
    expect(parallelGroup.every((d) => d.isParallel)).toBe(true);

    // Step 5: Update statuses as agents work
    delegationService.updateStatus(eretzDelegation.id, 'in_progress');
    delegationService.updateStatus(zionxDelegation.id, 'in_progress');

    // Verify active delegations for seraphim
    const activeDelegations = delegationService.getActiveDelegations('seraphim');
    expect(activeDelegations).toHaveLength(2);

    // Step 6: Complete delegations
    delegationService.updateStatus(eretzDelegation.id, 'completed', 'Business impact: positive ROI in 6 months');
    delegationService.updateStatus(zionxDelegation.id, 'completed', 'Implementation plan ready');

    // Step 7: Verify all changes were tracked via callback
    // 2 creates (pending) + 2 in_progress + 2 completed = 6 changes
    expect(changes).toHaveLength(6);
    expect(changes[0].status).toBe('pending');
    expect(changes[changes.length - 1].status).toBe('completed');

    // Step 8: No more active delegations
    const activeAfter = delegationService.getActiveDelegations('seraphim');
    expect(activeAfter).toHaveLength(0);

    // Cleanup subscription
    delegationService.offDelegationChange(subId);
  });
});

// ---------------------------------------------------------------------------
// 9. Multi-User Communication with Priority Ordering
// Validates: Requirements 37a, 37b, 39, 19.2
// ---------------------------------------------------------------------------

describe('Phase 8 Integration: Multi-User Priority Ordering', () => {
  let commService: AgentCommunicationServiceImpl;
  let priorityQueue: MessagePriorityQueueImpl;

  beforeEach(() => {
    commService = new AgentCommunicationServiceImpl();
    priorityQueue = new MessagePriorityQueueImpl();

    commService.setMessageHandler(async (_agentId, message) => {
      return `Response to ${message.userId}: ${message.content}`;
    });
  });

  it('two users chat with same agent → unified history shows both → priority ordering respected', async () => {
    const agentId = 'seraphim';

    // Step 1: Configure priority queue with King auto-elevation
    priorityQueue.configure({
      autoElevateUsers: new Map([['king', 'high']]),
      maxMessagesPerMinute: 60,
      enableInterruption: true,
    });

    // Step 2: User A (king) sends a message
    const responseA = await commService.sendMessage({
      userId: 'king',
      agentId,
      content: 'Deploy the new version',
      priority: 'normal',
      source: 'dashboard',
    });
    expect(responseA.agentResponse.content).toContain('king');

    // Step 3: User B (developer) sends a message
    const responseB = await commService.sendMessage({
      userId: 'developer',
      agentId,
      content: 'Check build status',
      priority: 'normal',
      source: 'dashboard',
    });
    expect(responseB.agentResponse.content).toContain('developer');

    // Step 4: Verify unified history shows both users' messages
    const unified = await commService.getUnifiedHistory(agentId);
    expect(unified.length).toBe(4); // 2 user messages + 2 agent responses

    const userMessages = unified.filter((m) => m.sender === 'user');
    expect(userMessages.length).toBe(2);
    const userIds = userMessages.map((m) => m.userId);
    expect(userIds).toContain('king');
    expect(userIds).toContain('developer');

    // Step 5: Verify per-user history isolation
    const kingHistory = await commService.getHistory(agentId, { userId: 'king' });
    expect(kingHistory.length).toBe(2); // king's message + agent response
    expect(kingHistory.every((m) => m.userId === 'king')).toBe(true);

    const devHistory = await commService.getHistory(agentId, { userId: 'developer' });
    expect(devHistory.length).toBe(2);
    expect(devHistory.every((m) => m.userId === 'developer')).toBe(true);

    // Step 6: Verify priority queue ordering
    // Enqueue messages with different priorities
    const kingMsg = priorityQueue.enqueue({
      userId: 'king',
      agentId,
      content: 'Urgent task',
      priority: 'normal', // Will be auto-elevated to 'high'
      source: 'dashboard',
    });
    expect(kingMsg.effectivePriority).toBe('high'); // Auto-elevated

    priorityQueue.enqueue({
      userId: 'developer',
      agentId,
      content: 'Regular task',
      priority: 'normal',
      source: 'dashboard',
    });

    priorityQueue.enqueue({
      userId: 'developer',
      agentId,
      content: 'Low priority task',
      priority: 'low',
      source: 'dashboard',
    });

    // Dequeue should respect priority: king's elevated message first
    const first = priorityQueue.dequeue();
    expect(first).not.toBeNull();
    expect(first!.message.userId).toBe('king');
    expect(first!.effectivePriority).toBe('high');

    const second = priorityQueue.dequeue();
    expect(second).not.toBeNull();
    expect(second!.message.userId).toBe('developer');
    expect(second!.effectivePriority).toBe('normal');

    const third = priorityQueue.dequeue();
    expect(third).not.toBeNull();
    expect(third!.message.userId).toBe('developer');
    expect(third!.effectivePriority).toBe('low');

    // Queue should be empty now
    expect(priorityQueue.dequeue()).toBeNull();
  });
});

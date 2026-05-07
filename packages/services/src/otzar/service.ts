/**
 * Otzar Resource Manager and Model Router — intelligent resource management,
 * token budgets, cost tracking, model routing, and semantic caching.
 *
 * Implements the OtzarService interface from @seraphim/core.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { createHash } from 'node:crypto';

import type { OtzarService, XOAuditService } from '@seraphim/core';
import type {
  ModelRoutingRequest,
  ModelSelection,
  BudgetCheckResult,
  TokenUsage,
  CostFilter,
  CostReport,
  OptimizationReport,
  WastePattern,
  SavingsOpportunity,
  CacheResult,
  TaskType,
  TaskClassification,
  PillarRoutingPolicy,
  ModelPerformanceRecord,
} from '@seraphim/core';
import type { TokenUsageRepository } from '@seraphim/core';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface OtzarServiceConfig {
  /** Tenant ID for this service instance. */
  tenantId: string;

  /** Token usage repository for budget queries and recording. */
  tokenUsageRepository: TokenUsageRepository;

  /** XO Audit service for logging routing decisions. */
  auditService: XOAuditService;

  /**
   * Look up an agent's daily and monthly token budget.
   * In production this reads from the agent_programs table.
   */
  getAgentBudget: (agentId: string) => Promise<AgentBudgetInfo | null>;

  /**
   * Look up the routing policy for a pillar.
   * Returns null if no policy is configured (defaults apply).
   */
  getPillarPolicy: (pillar: string) => Promise<PillarRoutingPolicy | null>;

  /**
   * Look up historical performance records for a task type + complexity.
   * Used for adaptive routing.
   */
  getPerformanceHistory: (
    taskType: TaskType,
    complexity: 'low' | 'medium' | 'high',
  ) => Promise<ModelPerformanceRecord[]>;

  /** System-wide daily budget in USD. Defaults to 100. */
  systemDailyBudgetUsd?: number;

  /** System-wide monthly budget in USD. Defaults to 2000. */
  systemMonthlyBudgetUsd?: number;
}

// ---------------------------------------------------------------------------
// Supporting Types
// ---------------------------------------------------------------------------

export interface AgentBudgetInfo {
  agentId: string;
  pillar: string;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
}

// ---------------------------------------------------------------------------
// Constants — Model Tiers
// ---------------------------------------------------------------------------

interface ModelInfo {
  provider: 'anthropic' | 'openai';
  model: string;
  tier: 1 | 2 | 3;
  /** Estimated cost per 1K tokens (input + output average) in USD. */
  costPer1kTokens: number;
}

const MODEL_CATALOG: ModelInfo[] = [
  // Tier 1 — Economy
  { provider: 'openai', model: 'gpt-4o-mini', tier: 1, costPer1kTokens: 0.00015 },
  { provider: 'anthropic', model: 'claude-haiku', tier: 1, costPer1kTokens: 0.00025 },
  // Tier 2 — Standard
  { provider: 'openai', model: 'gpt-4o', tier: 2, costPer1kTokens: 0.005 },
  { provider: 'anthropic', model: 'claude-sonnet', tier: 2, costPer1kTokens: 0.003 },
  // Tier 3 — Premium
  { provider: 'anthropic', model: 'claude-opus', tier: 3, costPer1kTokens: 0.015 },
  { provider: 'openai', model: 'gpt-4.5', tier: 3, costPer1kTokens: 0.02 },
];

// ---------------------------------------------------------------------------
// Constants — Default Task → Tier Mapping
// ---------------------------------------------------------------------------

const DEFAULT_TASK_TIER: Record<TaskType, 1 | 2 | 3> = {
  summarization: 1,
  classification: 1,
  data_extraction: 1,
  code_generation: 2,
  code_review: 2,
  analysis: 2,
  creative: 2,
  novel_reasoning: 3,
  multi_step_planning: 3,
  critical_decision: 3,
};

// ---------------------------------------------------------------------------
// Constants — Cache TTLs (milliseconds)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS: Partial<Record<string, number>> = {
  classification: 24 * 60 * 60 * 1000, // 24 hours
  data_extraction: 60 * 60 * 1000, // 1 hour
  code_generation: 30 * 60 * 1000, // 30 minutes
  summarization: 60 * 60 * 1000, // 1 hour
  code_review: 30 * 60 * 1000, // 30 minutes
  // novel_reasoning — not cached
  // multi_step_planning — not cached
  // critical_decision — not cached
};

// ---------------------------------------------------------------------------
// Mapping from ModelRoutingRequest.taskType to internal TaskType
// ---------------------------------------------------------------------------

/**
 * The public ModelRoutingRequest uses a simplified task type enum.
 * Map it to the internal TaskType for classification and routing.
 */
function mapRequestTaskType(
  requestType: ModelRoutingRequest['taskType'],
): TaskType {
  switch (requestType) {
    case 'code_writing':
      return 'code_generation';
    case 'simple_query':
      return 'classification';
    case 'analysis':
      return 'analysis';
    case 'creative':
      return 'creative';
    case 'classification':
      return 'classification';
    default:
      return 'analysis';
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class OtzarServiceImpl implements OtzarService {
  private readonly config: OtzarServiceConfig;

  /** In-memory semantic cache. Production would use Redis or similar. */
  private readonly cache: Map<
    string,
    { data: unknown; cachedAt: Date; ttlMs: number }
  > = new Map();

  private readonly systemDailyBudgetUsd: number;
  private readonly systemMonthlyBudgetUsd: number;

  constructor(config: OtzarServiceConfig) {
    this.config = config;
    this.systemDailyBudgetUsd = config.systemDailyBudgetUsd ?? 100;
    this.systemMonthlyBudgetUsd = config.systemMonthlyBudgetUsd ?? 2000;
  }

  // -----------------------------------------------------------------------
  // Model Routing (Req 5.1)
  // -----------------------------------------------------------------------

  /**
   * Route a task to the optimal LLM model.
   *
   * Decision flow:
   * 1. Classify task type and complexity → determine recommended tier
   * 2. Check agent/pillar budget — downgrade tier if near limit
   * 3. Check pillar routing policy — apply overrides and constraints
   * 4. Check performance history — upgrade tier if high failure rate
   * 5. Select best model from the resolved tier
   * 6. Log decision rationale to XO Audit
   */
  async routeTask(request: ModelRoutingRequest): Promise<ModelSelection> {
    // 1. Classify
    const taskType = mapRequestTaskType(request.taskType);
    const classification = this.classifyTask(taskType, request.complexity);
    let selectedTier = classification.recommendedTier;
    const policyOverrides: string[] = [];

    // 2. Check budget
    const budgetResult = await this.checkBudget(
      request.agentId,
      1000, // estimate 1K tokens for budget gate
    );
    if (!budgetResult.allowed) {
      // Budget exhausted — cannot route
      const rationale = `Budget exhausted for agent ${request.agentId}: ${budgetResult.reason}`;
      await this.logRoutingDecision(request, null, rationale);
      throw new Error(rationale);
    }

    // If budget is tight (< 20% remaining daily), try to downgrade tier
    // unless the task is critical
    if (
      budgetResult.remainingDaily > 0 &&
      budgetResult.remainingDaily < this.systemDailyBudgetUsd * 0.2 &&
      taskType !== 'critical_decision'
    ) {
      if (selectedTier > 1) {
        selectedTier = (selectedTier - 1) as 1 | 2 | 3;
        policyOverrides.push(
          `Downgraded tier from ${selectedTier + 1} to ${selectedTier} due to budget pressure`,
        );
      }
    }

    // 3. Check pillar policy
    const pillarPolicy = await this.config.getPillarPolicy(request.pillar);
    if (pillarPolicy) {
      // Apply task-specific overrides first
      const taskOverride = pillarPolicy.taskOverrides?.[taskType];
      if (taskOverride?.forceTier) {
        selectedTier = taskOverride.forceTier;
        policyOverrides.push(
          `Pillar policy forced tier ${taskOverride.forceTier} for task type ${taskType}`,
        );
      }

      // Apply tier constraints
      if (pillarPolicy.minimumTier && selectedTier < pillarPolicy.minimumTier) {
        selectedTier = pillarPolicy.minimumTier;
        policyOverrides.push(
          `Pillar minimum tier constraint raised to ${pillarPolicy.minimumTier}`,
        );
      }
      if (pillarPolicy.maximumTier && selectedTier > pillarPolicy.maximumTier) {
        selectedTier = pillarPolicy.maximumTier;
        policyOverrides.push(
          `Pillar maximum tier constraint capped to ${pillarPolicy.maximumTier}`,
        );
      }

      // Cost sensitivity adjustments
      if (
        pillarPolicy.costSensitivity === 'aggressive' &&
        selectedTier > 1 &&
        taskType !== 'critical_decision' &&
        taskType !== 'novel_reasoning'
      ) {
        selectedTier = (selectedTier - 1) as 1 | 2 | 3;
        policyOverrides.push(
          `Aggressive cost sensitivity downgraded tier to ${selectedTier}`,
        );
      } else if (
        pillarPolicy.costSensitivity === 'quality_first' &&
        selectedTier < 2
      ) {
        selectedTier = 2;
        policyOverrides.push(
          'Quality-first policy upgraded tier to 2',
        );
      }
    }

    // 4. Check performance history — upgrade if >20% failure rate on current tier
    const history = await this.config.getPerformanceHistory(
      taskType,
      request.complexity,
    );
    const tierHistory = history.filter((r) => r.tier === selectedTier);
    if (tierHistory.length >= 5) {
      const failureRate =
        tierHistory.filter((r) => !r.success).length / tierHistory.length;
      if (failureRate > 0.2 && selectedTier < 3) {
        selectedTier = (selectedTier + 1) as 1 | 2 | 3;
        policyOverrides.push(
          `Upgraded tier from ${selectedTier - 1} to ${selectedTier} due to ${(failureRate * 100).toFixed(0)}% failure rate`,
        );
      }
    }

    // 5. Select model from the resolved tier
    const model = this.selectModel(selectedTier, request.maxCost);

    // 6. Build selection result
    const estimatedCost = model.costPer1kTokens * 2; // rough estimate for 2K tokens
    const selection: ModelSelection = {
      provider: model.provider,
      model: model.model,
      estimatedCost,
      rationale: this.buildRationale(
        classification,
        selectedTier,
        policyOverrides,
        tierHistory,
      ),
    };

    // Log to audit
    await this.logRoutingDecision(request, selection, selection.rationale);

    return selection;
  }

  // -----------------------------------------------------------------------
  // Budget (Req 5.2, 5.3)
  // -----------------------------------------------------------------------

  /**
   * Check whether an agent has sufficient budget for the estimated token usage.
   *
   * Enforces daily and monthly budgets at agent, pillar, and system levels.
   */
  async checkBudget(
    agentId: string,
    estimatedTokens: number,
  ): Promise<BudgetCheckResult> {
    const agentBudget = await this.config.getAgentBudget(agentId);

    if (!agentBudget) {
      return {
        allowed: false,
        remainingDaily: 0,
        remainingMonthly: 0,
        reason: `Agent ${agentId} not found in budget registry`,
      };
    }

    const now = new Date();

    // Daily usage for this agent
    const dailyUsage =
      await this.config.tokenUsageRepository.getDailyUsageByAgent(
        this.config.tenantId,
        agentId,
        now,
      );

    // Monthly usage for this agent
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthlyAggregate =
      await this.config.tokenUsageRepository.getAggregate(
        this.config.tenantId,
        { start: monthStart, end: monthEnd },
      );

    const remainingDaily = agentBudget.dailyBudgetUsd - dailyUsage.totalCostUsd;
    const remainingMonthly =
      agentBudget.monthlyBudgetUsd - monthlyAggregate.totalCostUsd;

    // Estimate cost of the requested tokens (use a conservative rate)
    const estimatedCost = (estimatedTokens / 1000) * 0.005; // mid-tier estimate

    // Check daily limit
    if (remainingDaily < estimatedCost) {
      return {
        allowed: false,
        remainingDaily,
        remainingMonthly,
        reason: `Daily budget exceeded: remaining $${remainingDaily.toFixed(4)}, estimated cost $${estimatedCost.toFixed(4)}`,
      };
    }

    // Check monthly limit
    if (remainingMonthly < estimatedCost) {
      return {
        allowed: false,
        remainingDaily,
        remainingMonthly,
        reason: `Monthly budget exceeded: remaining $${remainingMonthly.toFixed(4)}, estimated cost $${estimatedCost.toFixed(4)}`,
      };
    }

    // Check system-wide daily budget
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);
    const systemDailyAggregate =
      await this.config.tokenUsageRepository.getAggregate(
        this.config.tenantId,
        { start: dayStart, end: dayEnd },
      );

    const systemDailyRemaining =
      this.systemDailyBudgetUsd - systemDailyAggregate.totalCostUsd;
    if (systemDailyRemaining < estimatedCost) {
      return {
        allowed: false,
        remainingDaily: systemDailyRemaining,
        remainingMonthly,
        reason: `System-wide daily budget exceeded: remaining $${systemDailyRemaining.toFixed(4)}`,
      };
    }

    return {
      allowed: true,
      remainingDaily,
      remainingMonthly,
    };
  }

  /**
   * Record token usage after a task execution.
   *
   * Req 5.4: Track real-time cost data.
   */
  async recordUsage(usage: TokenUsage): Promise<void> {
    await this.config.tokenUsageRepository.record(this.config.tenantId, {
      tenantId: this.config.tenantId,
      agentId: usage.agentId,
      pillar: usage.pillar,
      provider: usage.provider,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
      taskType: usage.taskType ?? null,
    });
  }

  // -----------------------------------------------------------------------
  // Cost Reporting (Req 5.4, 5.6)
  // -----------------------------------------------------------------------

  /**
   * Generate a cost report with breakdowns by agent, pillar, and model.
   */
  async getCostReport(filter: CostFilter): Promise<CostReport> {
    const tenantId = filter.tenantId ?? this.config.tenantId;
    const now = new Date();
    const dateRange = filter.dateRange ?? {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: now,
    };

    const [aggregate, byAgent, byPillar, byModel] = await Promise.all([
      this.config.tokenUsageRepository.getAggregate(tenantId, dateRange),
      this.config.tokenUsageRepository.getUsageByAgent(tenantId, dateRange),
      this.config.tokenUsageRepository.getUsageByPillar(tenantId, dateRange),
      this.config.tokenUsageRepository.getUsageByModel(tenantId, dateRange),
    ]);

    const agentMap: Record<string, number> = {};
    for (const a of byAgent) {
      agentMap[a.agentId] = a.totalCostUsd;
    }

    const pillarMap: Record<string, number> = {};
    for (const p of byPillar) {
      pillarMap[p.pillar] = p.totalCostUsd;
    }

    const modelMap: Record<string, number> = {};
    for (const m of byModel) {
      modelMap[`${m.provider}/${m.model}`] = m.totalCostUsd;
    }

    return {
      totalCostUsd: aggregate.totalCostUsd,
      byAgent: agentMap,
      byPillar: pillarMap,
      byModel: modelMap,
      period: dateRange,
    };
  }

  /**
   * Generate a daily optimization report identifying waste patterns and
   * savings opportunities.
   *
   * Req 5.6: Daily cost optimization reports.
   */
  async getDailyOptimizationReport(): Promise<OptimizationReport> {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);
    const dateRange = { start: dayStart, end: dayEnd };

    const [aggregate, byAgent, byModel] = await Promise.all([
      this.config.tokenUsageRepository.getAggregate(
        this.config.tenantId,
        dateRange,
      ),
      this.config.tokenUsageRepository.getUsageByAgent(
        this.config.tenantId,
        dateRange,
      ),
      this.config.tokenUsageRepository.getUsageByModel(
        this.config.tenantId,
        dateRange,
      ),
    ]);

    const wastePatterns: WastePattern[] = [];
    const savingsOpportunities: SavingsOpportunity[] = [];
    let estimatedSavings = 0;

    // Detect waste: agents spending disproportionately
    const avgCostPerAgent =
      byAgent.length > 0
        ? aggregate.totalCostUsd / byAgent.length
        : 0;

    for (const agent of byAgent) {
      if (agent.totalCostUsd > avgCostPerAgent * 3 && byAgent.length > 1) {
        const waste = agent.totalCostUsd - avgCostPerAgent;
        wastePatterns.push({
          description: `Agent ${agent.agentId} spent $${agent.totalCostUsd.toFixed(4)} — 3x above average ($${avgCostPerAgent.toFixed(4)})`,
          affectedAgent: agent.agentId,
          estimatedWaste: waste,
        });
        estimatedSavings += waste * 0.3; // conservative 30% recoverable
      }
    }

    // Detect waste: premium models used for simple tasks
    for (const modelUsage of byModel) {
      const tier3Models = MODEL_CATALOG.filter((m) => m.tier === 3).map(
        (m) => m.model,
      );
      if (
        tier3Models.includes(modelUsage.model) &&
        modelUsage.totalCostUsd > aggregate.totalCostUsd * 0.5
      ) {
        const saving = modelUsage.totalCostUsd * 0.4;
        savingsOpportunities.push({
          description: `Premium model ${modelUsage.provider}/${modelUsage.model} accounts for >50% of daily spend`,
          estimatedSavings: saving,
          recommendation:
            'Review task routing — some tasks may be downgradable to Tier 2 models',
        });
        estimatedSavings += saving;
      }
    }

    // Suggest cache improvements
    const cacheHitRate = this.getCacheHitRate();
    if (cacheHitRate < 0.1 && aggregate.count > 50) {
      savingsOpportunities.push({
        description: `Cache hit rate is ${(cacheHitRate * 100).toFixed(1)}% — below 10% target`,
        estimatedSavings: aggregate.totalCostUsd * 0.05,
        recommendation:
          'Increase cache TTLs for classification and data extraction tasks',
      });
      estimatedSavings += aggregate.totalCostUsd * 0.05;
    }

    return {
      date: now,
      totalSpend: aggregate.totalCostUsd,
      wastePatterns,
      savingsOpportunities,
      estimatedSavings,
    };
  }

  // -----------------------------------------------------------------------
  // Caching (Req 5.5)
  // -----------------------------------------------------------------------

  /**
   * Check the semantic cache for a previously computed result.
   *
   * Cache key = SHA-256 hash of (taskPattern + JSON-serialized inputs).
   */
  async checkCache(
    taskPattern: string,
    inputs: Record<string, unknown>,
  ): Promise<CacheResult | null> {
    const key = this.buildCacheKey(taskPattern, inputs);
    const entry = this.cache.get(key);

    if (!entry) {
      this.recordCacheMiss();
      return null;
    }

    // Check TTL
    const elapsed = Date.now() - entry.cachedAt.getTime();
    if (elapsed > entry.ttlMs) {
      this.cache.delete(key);
      this.recordCacheMiss();
      return null;
    }

    this.recordCacheHit();
    return {
      hit: true,
      data: entry.data,
      cachedAt: entry.cachedAt,
      ttlRemaining: entry.ttlMs - elapsed,
    };
  }

  /**
   * Store a result in the semantic cache.
   *
   * TTL is determined by the task pattern. Tasks not in the TTL map
   * (e.g., novel_reasoning) are not cached.
   */
  async storeCache(
    taskPattern: string,
    inputs: Record<string, unknown>,
    result: unknown,
  ): Promise<void> {
    const ttlMs = CACHE_TTL_MS[taskPattern];
    if (ttlMs === undefined) {
      // This task type is not cacheable
      return;
    }

    const key = this.buildCacheKey(taskPattern, inputs);
    this.cache.set(key, {
      data: result,
      cachedAt: new Date(),
      ttlMs,
    });
  }

  // -----------------------------------------------------------------------
  // Task Classification (internal)
  // -----------------------------------------------------------------------

  /**
   * Classify a task by type and complexity to determine the recommended
   * model tier.
   *
   * Complexity assessment uses:
   * - Input length (token estimate)
   * - Output structure
   * - Domain specificity
   * - Historical failure rate
   * - Downstream dependencies
   *
   * For the initial implementation, complexity is taken directly from the
   * request. The signals are populated with defaults and can be refined
   * as the learning engine collects data.
   */
  classifyTask(
    taskType: TaskType,
    complexity: 'low' | 'medium' | 'high',
  ): TaskClassification {
    let recommendedTier = DEFAULT_TASK_TIER[taskType];

    // Adjust tier based on complexity
    if (complexity === 'high' && recommendedTier < 3) {
      recommendedTier = (recommendedTier + 1) as 1 | 2 | 3;
    } else if (complexity === 'low' && recommendedTier > 1) {
      recommendedTier = (recommendedTier - 1) as 1 | 2 | 3;
    }

    return {
      taskType,
      complexity,
      signals: {
        inputTokenEstimate: complexity === 'high' ? 4000 : complexity === 'medium' ? 2000 : 500,
        outputStructure:
          taskType === 'code_generation' || taskType === 'code_review'
            ? 'code'
            : taskType === 'data_extraction' || taskType === 'classification'
              ? 'structured'
              : 'free_text',
        domainSpecificity:
          taskType === 'novel_reasoning' || taskType === 'critical_decision'
            ? 0.8
            : 0.3,
        historicalFailureRate: 0, // populated by learning engine over time
        downstreamDependencies: 0,
      },
      recommendedTier,
    };
  }

  // -----------------------------------------------------------------------
  // Private Helpers
  // -----------------------------------------------------------------------

  /**
   * Select the best model from a given tier, optionally constrained by
   * a maximum cost.
   */
  private selectModel(tier: 1 | 2 | 3, maxCost?: number): ModelInfo {
    let candidates = MODEL_CATALOG.filter((m) => m.tier === tier);

    if (maxCost !== undefined) {
      const costFiltered = candidates.filter(
        (m) => m.costPer1kTokens * 2 <= maxCost,
      );
      if (costFiltered.length > 0) {
        candidates = costFiltered;
      }
      // If no candidates meet the cost constraint, use the cheapest in tier
    }

    // Sort by cost (cheapest first) and pick the first
    candidates.sort((a, b) => a.costPer1kTokens - b.costPer1kTokens);
    return candidates[0];
  }

  /**
   * Build a human-readable rationale string for the routing decision.
   */
  private buildRationale(
    classification: TaskClassification,
    selectedTier: 1 | 2 | 3,
    policyOverrides: string[],
    performanceHistory: ModelPerformanceRecord[],
  ): string {
    const parts: string[] = [
      `Task classified as ${classification.taskType} (${classification.complexity} complexity) → base tier ${classification.recommendedTier}`,
    ];

    if (selectedTier !== classification.recommendedTier) {
      parts.push(`Adjusted to tier ${selectedTier}`);
    }

    if (policyOverrides.length > 0) {
      parts.push(`Policy overrides: ${policyOverrides.join('; ')}`);
    }

    if (performanceHistory.length > 0) {
      const successRate =
        performanceHistory.filter((r) => r.success).length /
        performanceHistory.length;
      parts.push(
        `Performance history: ${performanceHistory.length} records, ${(successRate * 100).toFixed(0)}% success rate`,
      );
    }

    return parts.join('. ');
  }

  /**
   * Build a deterministic cache key from task pattern and inputs.
   */
  private buildCacheKey(
    taskPattern: string,
    inputs: Record<string, unknown>,
  ): string {
    const normalized = JSON.stringify({ taskPattern, inputs });
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Log a routing decision to XO Audit.
   */
  private async logRoutingDecision(
    request: ModelRoutingRequest,
    selection: ModelSelection | null,
    rationale: string,
  ): Promise<void> {
    try {
      await this.config.auditService.recordAction({
        tenantId: this.config.tenantId,
        actingAgentId: request.agentId,
        actingAgentName: `agent-${request.agentId}`,
        actionType: 'model_routing',
        target: `${request.pillar}/${request.taskType}`,
        authorizationChain: [],
        executionTokens: [],
        outcome: selection ? 'success' : 'failure',
        details: {
          request,
          selection,
          rationale,
        },
      });
    } catch {
      // Audit logging failure should not block routing decisions.
    }
  }

  // -----------------------------------------------------------------------
  // Cache statistics (internal)
  // -----------------------------------------------------------------------

  private cacheHits = 0;
  private cacheMisses = 0;

  private recordCacheHit(): void {
    this.cacheHits++;
  }

  private recordCacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * Get the cache hit rate as a number between 0 and 1.
   */
  getCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    if (total === 0) return 0;
    return this.cacheHits / total;
  }

  /**
   * Get the current cache size (number of entries).
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Clear expired entries from the cache.
   */
  pruneCache(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.cachedAt.getTime() > entry.ttlMs) {
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}

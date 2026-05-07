/**
 * Otzar (Resource Manager) service interface — token budgets, cost tracking,
 * and model routing.
 */

import type {
  ModelRoutingRequest,
  ModelSelection,
  BudgetCheckResult,
  TokenUsage,
  CostFilter,
  CostReport,
  OptimizationReport,
  CacheResult,
} from '../types/otzar.js';

export interface OtzarService {
  // Model Routing
  routeTask(request: ModelRoutingRequest): Promise<ModelSelection>;

  // Budget
  checkBudget(agentId: string, estimatedTokens: number): Promise<BudgetCheckResult>;
  recordUsage(usage: TokenUsage): Promise<void>;

  // Cost Reporting
  getCostReport(filter: CostFilter): Promise<CostReport>;
  getDailyOptimizationReport(): Promise<OptimizationReport>;

  // Caching
  checkCache(
    taskPattern: string,
    inputs: Record<string, unknown>,
  ): Promise<CacheResult | null>;
  storeCache(
    taskPattern: string,
    inputs: Record<string, unknown>,
    result: unknown,
  ): Promise<void>;
}

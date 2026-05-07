/**
 * Otzar resource management and model routing data models.
 */

// ---------------------------------------------------------------------------
// Task Type
// ---------------------------------------------------------------------------

export type TaskType =
  | 'summarization'
  | 'classification'
  | 'data_extraction'
  | 'code_generation'
  | 'code_review'
  | 'analysis'
  | 'creative'
  | 'novel_reasoning'
  | 'multi_step_planning'
  | 'critical_decision';

// ---------------------------------------------------------------------------
// Model Routing Request
// ---------------------------------------------------------------------------

export interface ModelRoutingRequest {
  taskType: 'code_writing' | 'analysis' | 'simple_query' | 'creative' | 'classification';
  complexity: 'low' | 'medium' | 'high';
  agentId: string;
  pillar: string;
  maxCost?: number;
}

// ---------------------------------------------------------------------------
// Model Selection
// ---------------------------------------------------------------------------

export interface ModelSelection {
  provider: 'anthropic' | 'openai';
  model: string;
  estimatedCost: number;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Task Classification
// ---------------------------------------------------------------------------

export interface TaskClassification {
  taskType: TaskType;
  complexity: 'low' | 'medium' | 'high';
  signals: {
    inputTokenEstimate: number;
    outputStructure: 'free_text' | 'structured' | 'code';
    domainSpecificity: number;
    historicalFailureRate: number;
    downstreamDependencies: number;
  };
  recommendedTier: 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// Model Performance Record
// ---------------------------------------------------------------------------

export interface ModelPerformanceRecord {
  taskType: TaskType;
  complexity: 'low' | 'medium' | 'high';
  model: string;
  tier: 1 | 2 | 3;

  // Outcome
  success: boolean;
  /** 0.0 – 1.0 (from completion contract validation) */
  qualityScore: number;
  latencyMs: number;
  tokenCost: number;

  // Context
  agentId: string;
  pillar: string;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Pillar Routing Policy
// ---------------------------------------------------------------------------

export interface PillarRoutingPolicy {
  pillarId: string;

  // Cost vs Quality
  costSensitivity: 'aggressive' | 'balanced' | 'quality_first';

  // Tier constraints
  minimumTier?: 1 | 2 | 3;
  maximumTier?: 1 | 2 | 3;

  // Task-specific overrides
  taskOverrides?: Record<
    TaskType,
    {
      forceTier?: 1 | 2 | 3;
      forceModel?: string;
    }
  >;

  // Budget
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
}

// ---------------------------------------------------------------------------
// Budget Check Result
// ---------------------------------------------------------------------------

export interface BudgetCheckResult {
  allowed: boolean;
  remainingDaily: number;
  remainingMonthly: number;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Token Usage
// ---------------------------------------------------------------------------

export interface TokenUsage {
  agentId: string;
  tenantId: string;
  pillar: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  taskType?: string;
}

// ---------------------------------------------------------------------------
// Cost Filter / Report
// ---------------------------------------------------------------------------

export interface CostFilter {
  tenantId?: string;
  agentId?: string;
  pillar?: string;
  dateRange?: { start: Date; end: Date };
}

export interface CostReport {
  totalCostUsd: number;
  byAgent: Record<string, number>;
  byPillar: Record<string, number>;
  byModel: Record<string, number>;
  period: { start: Date; end: Date };
}

// ---------------------------------------------------------------------------
// Optimization Report
// ---------------------------------------------------------------------------

export interface OptimizationReport {
  date: Date;
  totalSpend: number;
  wastePatterns: WastePattern[];
  savingsOpportunities: SavingsOpportunity[];
  estimatedSavings: number;
}

export interface WastePattern {
  description: string;
  affectedAgent: string;
  estimatedWaste: number;
}

export interface SavingsOpportunity {
  description: string;
  estimatedSavings: number;
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Cache Result
// ---------------------------------------------------------------------------

export interface CacheResult {
  hit: boolean;
  data: unknown;
  cachedAt: Date;
  ttlRemaining: number;
}

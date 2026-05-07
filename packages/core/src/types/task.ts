/**
 * Task-related data models used by the Agent Runtime.
 */

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  type: string;
  description: string;
  params: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Task Result
// ---------------------------------------------------------------------------

export interface TaskResult {
  taskId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  durationMs: number;
}

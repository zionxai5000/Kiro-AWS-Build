/**
 * n8n API Driver — workflow automation, webhook triggering, and execution management.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for API key
 * authentication, and implements all n8n operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */

import { BaseDriver } from '../base/driver.js';
import type {
  DriverOperation,
  DriverResult,
  VerificationResult,
} from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const N8N_ERROR_CODES = {
  UNAUTHORIZED: 'N8N_UNAUTHORIZED',
  FORBIDDEN: 'N8N_FORBIDDEN',
  NOT_FOUND: 'N8N_NOT_FOUND',
  RATE_LIMITED: 'N8N_RATE_LIMITED',
  INVALID_PARAMS: 'N8N_INVALID_PARAMS',
  WORKFLOW_NOT_FOUND: 'N8N_WORKFLOW_NOT_FOUND',
  WORKFLOW_INACTIVE: 'N8N_WORKFLOW_INACTIVE',
  EXECUTION_FAILED: 'N8N_EXECUTION_FAILED',
  WEBHOOK_NOT_FOUND: 'N8N_WEBHOOK_NOT_FOUND',
  TIMEOUT: 'N8N_TIMEOUT',
  UNSUPPORTED_OPERATION: 'N8N_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type N8nWorkflowStatus = 'active' | 'inactive' | 'error';

export type N8nExecutionStatus = 'running' | 'success' | 'error' | 'waiting' | 'canceled';

export interface N8nWorkflow {
  id: string;
  name: string;
  status: N8nWorkflowStatus;
  nodes: number;
  connections: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface N8nExecution {
  id: string;
  workflowId: string;
  status: N8nExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  mode: 'manual' | 'trigger' | 'webhook' | 'retry';
  data?: Record<string, unknown>;
  error?: string;
}

export interface N8nWebhook {
  id: string;
  workflowId: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface N8nDriverConfig {
  /** The n8n API key name in Credential Manager. */
  apiKeyName: string;
  /** The n8n instance base URL. */
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// n8n Driver
// ---------------------------------------------------------------------------

export class N8nDriver extends BaseDriver<N8nDriverConfig> {
  readonly name = 'n8n';
  readonly version = '1.0.0';

  private _apiKey: string | null = null;
  private _driverConfig: N8nDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    super({ maxAttempts: 3, initialDelayMs: 1000 });
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: N8nDriverConfig): Promise<void> {
    if (!config.apiKeyName) {
      throw new Error('n8n API key name is required');
    }
    if (!config.baseUrl) {
      throw new Error('n8n instance base URL is required');
    }

    this._apiKey = await this.credentialManager.getCredential('n8n', config.apiKeyName);
    if (!this._apiKey) {
      throw new Error('Failed to retrieve n8n API key from Credential Manager');
    }
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'n8n',
      authenticated: true,
      baseUrl: config.baseUrl,
    });
  }

  protected async doDisconnect(): Promise<void> {
    this._apiKey = null;
    this._driverConfig = null;
    this._completedOperations.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOpId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, N8N_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'triggerWebhook':
        return this.handleTriggerWebhook(operation, operationId);
      case 'getWorkflow':
        return this.handleGetWorkflow(operation, operationId);
      case 'listWorkflows':
        return this.handleListWorkflows(operation, operationId);
      case 'activateWorkflow':
        return this.handleActivateWorkflow(operation, operationId);
      case 'deactivateWorkflow':
        return this.handleDeactivateWorkflow(operation, operationId);
      case 'executeWorkflow':
        return this.handleExecuteWorkflow(operation, operationId);
      case 'getExecution':
        return this.handleGetExecution(operation, operationId);
      case 'listExecutions':
        return this.handleListExecutions(operation, operationId);
      case 'getWebhooks':
        return this.handleGetWebhooks(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          N8N_ERROR_CODES.UNSUPPORTED_OPERATION,
          `Unsupported operation type: ${operation.type}`,
          false,
        );
    }
  }

  protected async doVerify(operationId: string): Promise<VerificationResult> {
    const result = this._completedOperations.get(operationId);
    return {
      verified: result !== undefined,
      operationId,
      details: result ? { success: result.success } : undefined,
    };
  }

  // =====================================================================
  // Operation Handlers
  // =====================================================================

  private async handleTriggerWebhook(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { webhookPath, method, payload } = operation.params as {
      webhookPath?: string;
      method?: string;
      payload?: Record<string, unknown>;
    };

    if (!webhookPath) {
      return this.errorResult(operationId, N8N_ERROR_CODES.INVALID_PARAMS, 'webhookPath is required for triggerWebhook', false);
    }

    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const result: DriverResult = {
      success: true,
      data: {
        executionId,
        webhookPath,
        method: method ?? 'POST',
        status: 'success' as N8nExecutionStatus,
        response: payload ?? {},
        triggeredAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetWorkflow(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { workflowId } = operation.params as { workflowId?: string };

    if (!workflowId) {
      return this.errorResult(operationId, N8N_ERROR_CODES.INVALID_PARAMS, 'workflowId is required for getWorkflow', false);
    }

    const workflow: N8nWorkflow = {
      id: workflowId,
      name: 'Mock Workflow',
      status: 'active',
      nodes: 0,
      connections: 0,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: workflow,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleListWorkflows(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { status, tags, limit } = operation.params as {
      status?: string;
      tags?: string[];
      limit?: number;
    };

    const result: DriverResult = {
      success: true,
      data: {
        workflows: [] as N8nWorkflow[],
        statusFilter: status ?? null,
        tagsFilter: tags ?? null,
        total: 0,
        limit: limit ?? 20,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleActivateWorkflow(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { workflowId } = operation.params as { workflowId?: string };

    if (!workflowId) {
      return this.errorResult(operationId, N8N_ERROR_CODES.INVALID_PARAMS, 'workflowId is required for activateWorkflow', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        workflowId,
        status: 'active' as N8nWorkflowStatus,
        activatedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleDeactivateWorkflow(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { workflowId } = operation.params as { workflowId?: string };

    if (!workflowId) {
      return this.errorResult(operationId, N8N_ERROR_CODES.INVALID_PARAMS, 'workflowId is required for deactivateWorkflow', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        workflowId,
        status: 'inactive' as N8nWorkflowStatus,
        deactivatedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleExecuteWorkflow(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { workflowId, inputData } = operation.params as {
      workflowId?: string;
      inputData?: Record<string, unknown>;
    };

    if (!workflowId) {
      return this.errorResult(operationId, N8N_ERROR_CODES.INVALID_PARAMS, 'workflowId is required for executeWorkflow', false);
    }

    const execution: N8nExecution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workflowId,
      status: 'success',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      mode: 'manual',
      data: inputData,
    };

    const result: DriverResult = {
      success: true,
      data: execution,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetExecution(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { executionId } = operation.params as { executionId?: string };

    if (!executionId) {
      return this.errorResult(operationId, N8N_ERROR_CODES.INVALID_PARAMS, 'executionId is required for getExecution', false);
    }

    const execution: N8nExecution = {
      id: executionId,
      workflowId: 'unknown',
      status: 'success',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      mode: 'manual',
    };

    const result: DriverResult = {
      success: true,
      data: execution,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleListExecutions(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { workflowId, status, limit } = operation.params as {
      workflowId?: string;
      status?: string;
      limit?: number;
    };

    const result: DriverResult = {
      success: true,
      data: {
        executions: [] as N8nExecution[],
        workflowId: workflowId ?? null,
        statusFilter: status ?? null,
        total: 0,
        limit: limit ?? 20,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetWebhooks(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { workflowId } = operation.params as { workflowId?: string };

    const result: DriverResult = {
      success: true,
      data: {
        webhooks: [] as N8nWebhook[],
        workflowId: workflowId ?? null,
        baseUrl: this._driverConfig!.baseUrl,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  // =====================================================================
  // Helpers
  // =====================================================================

  private createOpId(): string {
    return `n8n-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private errorResult(
    operationId: string,
    code: string,
    message: string,
    retryable: boolean,
    details?: Record<string, unknown>,
  ): DriverResult {
    return {
      success: false,
      error: { code, message, retryable, details },
      retryable,
      operationId,
    };
  }
}

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
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const N8N_ERROR_CODES: {
    readonly UNAUTHORIZED: "N8N_UNAUTHORIZED";
    readonly FORBIDDEN: "N8N_FORBIDDEN";
    readonly NOT_FOUND: "N8N_NOT_FOUND";
    readonly RATE_LIMITED: "N8N_RATE_LIMITED";
    readonly INVALID_PARAMS: "N8N_INVALID_PARAMS";
    readonly WORKFLOW_NOT_FOUND: "N8N_WORKFLOW_NOT_FOUND";
    readonly WORKFLOW_INACTIVE: "N8N_WORKFLOW_INACTIVE";
    readonly EXECUTION_FAILED: "N8N_EXECUTION_FAILED";
    readonly WEBHOOK_NOT_FOUND: "N8N_WEBHOOK_NOT_FOUND";
    readonly TIMEOUT: "N8N_TIMEOUT";
    readonly UNSUPPORTED_OPERATION: "N8N_UNSUPPORTED_OPERATION";
};
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
export interface N8nDriverConfig {
    /** The n8n API key name in Credential Manager. */
    apiKeyName: string;
    /** The n8n instance base URL. */
    baseUrl: string;
}
export declare class N8nDriver extends BaseDriver<N8nDriverConfig> {
    private readonly credentialManager;
    readonly name = "n8n";
    readonly version = "1.0.0";
    private _apiKey;
    private _driverConfig;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: N8nDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleTriggerWebhook;
    private handleGetWorkflow;
    private handleListWorkflows;
    private handleActivateWorkflow;
    private handleDeactivateWorkflow;
    private handleExecuteWorkflow;
    private handleGetExecution;
    private handleListExecutions;
    private handleGetWebhooks;
    private createOpId;
    private errorResult;
}
//# sourceMappingURL=n8n-driver.d.ts.map
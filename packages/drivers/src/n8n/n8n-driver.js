"use strict";
/**
 * n8n API Driver — workflow automation, webhook triggering, and execution management.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for API key
 * authentication, and implements all n8n operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.N8nDriver = exports.N8N_ERROR_CODES = void 0;
const driver_js_1 = require("../base/driver.js");
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
exports.N8N_ERROR_CODES = {
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
};
// ---------------------------------------------------------------------------
// n8n Driver
// ---------------------------------------------------------------------------
class N8nDriver extends driver_js_1.BaseDriver {
    credentialManager;
    name = 'n8n';
    version = '1.0.0';
    _apiKey = null;
    _driverConfig = null;
    _completedOperations = new Map();
    constructor(credentialManager) {
        super({ maxAttempts: 3, initialDelayMs: 1000 });
        this.credentialManager = credentialManager;
    }
    // =====================================================================
    // Lifecycle
    // =====================================================================
    async doConnect(config) {
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
    async doDisconnect() {
        this._apiKey = null;
        this._driverConfig = null;
        this._completedOperations.clear();
    }
    // =====================================================================
    // Execute
    // =====================================================================
    async doExecute(operation) {
        const operationId = this.createOpId();
        if (!this._driverConfig) {
            return this.errorResult(operationId, exports.N8N_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
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
                return this.errorResult(operationId, exports.N8N_ERROR_CODES.UNSUPPORTED_OPERATION, `Unsupported operation type: ${operation.type}`, false);
        }
    }
    async doVerify(operationId) {
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
    async handleTriggerWebhook(operation, operationId) {
        const { webhookPath, method, payload } = operation.params;
        if (!webhookPath) {
            return this.errorResult(operationId, exports.N8N_ERROR_CODES.INVALID_PARAMS, 'webhookPath is required for triggerWebhook', false);
        }
        const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const result = {
            success: true,
            data: {
                executionId,
                webhookPath,
                method: method ?? 'POST',
                status: 'success',
                response: payload ?? {},
                triggeredAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetWorkflow(operation, operationId) {
        const { workflowId } = operation.params;
        if (!workflowId) {
            return this.errorResult(operationId, exports.N8N_ERROR_CODES.INVALID_PARAMS, 'workflowId is required for getWorkflow', false);
        }
        const workflow = {
            id: workflowId,
            name: 'Mock Workflow',
            status: 'active',
            nodes: 0,
            connections: 0,
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        const result = {
            success: true,
            data: workflow,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleListWorkflows(operation, operationId) {
        const { status, tags, limit } = operation.params;
        const result = {
            success: true,
            data: {
                workflows: [],
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
    async handleActivateWorkflow(operation, operationId) {
        const { workflowId } = operation.params;
        if (!workflowId) {
            return this.errorResult(operationId, exports.N8N_ERROR_CODES.INVALID_PARAMS, 'workflowId is required for activateWorkflow', false);
        }
        const result = {
            success: true,
            data: {
                workflowId,
                status: 'active',
                activatedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleDeactivateWorkflow(operation, operationId) {
        const { workflowId } = operation.params;
        if (!workflowId) {
            return this.errorResult(operationId, exports.N8N_ERROR_CODES.INVALID_PARAMS, 'workflowId is required for deactivateWorkflow', false);
        }
        const result = {
            success: true,
            data: {
                workflowId,
                status: 'inactive',
                deactivatedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleExecuteWorkflow(operation, operationId) {
        const { workflowId, inputData } = operation.params;
        if (!workflowId) {
            return this.errorResult(operationId, exports.N8N_ERROR_CODES.INVALID_PARAMS, 'workflowId is required for executeWorkflow', false);
        }
        const execution = {
            id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            workflowId,
            status: 'success',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            mode: 'manual',
            data: inputData,
        };
        const result = {
            success: true,
            data: execution,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetExecution(operation, operationId) {
        const { executionId } = operation.params;
        if (!executionId) {
            return this.errorResult(operationId, exports.N8N_ERROR_CODES.INVALID_PARAMS, 'executionId is required for getExecution', false);
        }
        const execution = {
            id: executionId,
            workflowId: 'unknown',
            status: 'success',
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            mode: 'manual',
        };
        const result = {
            success: true,
            data: execution,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleListExecutions(operation, operationId) {
        const { workflowId, status, limit } = operation.params;
        const result = {
            success: true,
            data: {
                executions: [],
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
    async handleGetWebhooks(operation, operationId) {
        const { workflowId } = operation.params;
        const result = {
            success: true,
            data: {
                webhooks: [],
                workflowId: workflowId ?? null,
                baseUrl: this._driverConfig.baseUrl,
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
    createOpId() {
        return `n8n-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    errorResult(operationId, code, message, retryable, details) {
        return {
            success: false,
            error: { code, message, retryable, details },
            retryable,
            operationId,
        };
    }
}
exports.N8nDriver = N8nDriver;
//# sourceMappingURL=n8n-driver.js.map
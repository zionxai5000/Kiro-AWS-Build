"use strict";
/**
 * GitHub API Driver — repository, PR, issue, and workflow management via GitHub API.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for personal
 * access token / GitHub App authentication, and implements all GitHub operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubDriver = exports.GITHUB_ERROR_CODES = void 0;
const driver_js_1 = require("../base/driver.js");
// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------
exports.GITHUB_ERROR_CODES = {
    UNAUTHORIZED: 'GITHUB_UNAUTHORIZED',
    FORBIDDEN: 'GITHUB_FORBIDDEN',
    NOT_FOUND: 'GITHUB_NOT_FOUND',
    RATE_LIMITED: 'GITHUB_RATE_LIMITED',
    INVALID_PARAMS: 'GITHUB_INVALID_PARAMS',
    CONFLICT: 'GITHUB_CONFLICT',
    VALIDATION_FAILED: 'GITHUB_VALIDATION_FAILED',
    MERGE_CONFLICT: 'GITHUB_MERGE_CONFLICT',
    WORKFLOW_FAILED: 'GITHUB_WORKFLOW_FAILED',
    UNSUPPORTED_OPERATION: 'GITHUB_UNSUPPORTED_OPERATION',
};
// ---------------------------------------------------------------------------
// GitHub Driver
// ---------------------------------------------------------------------------
class GitHubDriver extends driver_js_1.BaseDriver {
    credentialManager;
    name = 'github';
    version = '1.0.0';
    _token = null;
    _driverConfig = null;
    _completedOperations = new Map();
    constructor(credentialManager) {
        super();
        this.credentialManager = credentialManager;
    }
    // =====================================================================
    // Lifecycle
    // =====================================================================
    async doConnect(config) {
        if (!config.tokenKeyName) {
            throw new Error('GitHub token key name is required');
        }
        if (!config.owner) {
            throw new Error('GitHub owner is required');
        }
        this._token = await this.credentialManager.getCredential('github', config.tokenKeyName);
        if (!this._token) {
            throw new Error('Failed to retrieve GitHub token from Credential Manager');
        }
        this._driverConfig = config;
        this.updateSessionData({
            provider: 'github',
            authenticated: true,
            owner: config.owner,
            apiBaseUrl: config.apiBaseUrl ?? 'https://api.github.com',
        });
    }
    async doDisconnect() {
        this._token = null;
        this._driverConfig = null;
        this._completedOperations.clear();
    }
    // =====================================================================
    // Execute
    // =====================================================================
    async doExecute(operation) {
        const operationId = this.createOpId();
        if (!this._driverConfig) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
        }
        switch (operation.type) {
            case 'createRepo':
                return this.handleCreateRepo(operation, operationId);
            case 'createPR':
                return this.handleCreatePR(operation, operationId);
            case 'mergePR':
                return this.handleMergePR(operation, operationId);
            case 'createIssue':
                return this.handleCreateIssue(operation, operationId);
            case 'closeIssue':
                return this.handleCloseIssue(operation, operationId);
            case 'listRepos':
                return this.handleListRepos(operation, operationId);
            case 'getWorkflowRuns':
                return this.handleGetWorkflowRuns(operation, operationId);
            case 'triggerWorkflow':
                return this.handleTriggerWorkflow(operation, operationId);
            default:
                return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.UNSUPPORTED_OPERATION, `Unsupported operation type: ${operation.type}`, false);
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
    async handleCreateRepo(operation, operationId) {
        const { name, description, isPrivate, autoInit } = operation.params;
        if (!name) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'name is required for createRepo', false);
        }
        const repo = {
            id: `repo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            fullName: `${this._driverConfig.owner}/${name}`,
            description: description ?? '',
            private: isPrivate ?? false,
            defaultBranch: 'main',
            language: null,
            stargazersCount: 0,
            forksCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            htmlUrl: `https://github.com/${this._driverConfig.owner}/${name}`,
        };
        const result = {
            success: true,
            data: repo,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleCreatePR(operation, operationId) {
        const { repo, title, body, head, base } = operation.params;
        if (!repo) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for createPR', false);
        }
        if (!title) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'title is required for createPR', false);
        }
        if (!head) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'head branch is required for createPR', false);
        }
        const pr = {
            id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            number: Math.floor(Math.random() * 10000) + 1,
            title,
            body: body ?? '',
            state: 'open',
            head,
            base: base ?? 'main',
            author: this._driverConfig.owner,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            htmlUrl: `https://github.com/${this._driverConfig.owner}/${repo}/pull/${Math.floor(Math.random() * 10000)}`,
        };
        const result = {
            success: true,
            data: pr,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleMergePR(operation, operationId) {
        const { repo, pullNumber, mergeMethod } = operation.params;
        if (!repo) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for mergePR', false);
        }
        if (!pullNumber) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'pullNumber is required for mergePR', false);
        }
        const result = {
            success: true,
            data: {
                merged: true,
                pullNumber,
                repo,
                mergeMethod: mergeMethod ?? 'merge',
                sha: `sha-${Math.random().toString(36).slice(2, 12)}`,
                mergedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleCreateIssue(operation, operationId) {
        const { repo, title, body, labels, assignees } = operation.params;
        if (!repo) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for createIssue', false);
        }
        if (!title) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'title is required for createIssue', false);
        }
        const issue = {
            id: `issue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            number: Math.floor(Math.random() * 10000) + 1,
            title,
            body: body ?? '',
            state: 'open',
            labels: labels ?? [],
            assignees: assignees ?? [],
            author: this._driverConfig.owner,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            htmlUrl: `https://github.com/${this._driverConfig.owner}/${repo}/issues/${Math.floor(Math.random() * 10000)}`,
        };
        const result = {
            success: true,
            data: issue,
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleCloseIssue(operation, operationId) {
        const { repo, issueNumber } = operation.params;
        if (!repo) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for closeIssue', false);
        }
        if (!issueNumber) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'issueNumber is required for closeIssue', false);
        }
        const result = {
            success: true,
            data: {
                issueNumber,
                repo,
                state: 'closed',
                closedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleListRepos(operation, operationId) {
        const { page, perPage, sort } = operation.params;
        const result = {
            success: true,
            data: {
                repos: [],
                totalCount: 0,
                page: page ?? 1,
                perPage: perPage ?? 30,
                sort: sort ?? 'updated',
                retrievedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleGetWorkflowRuns(operation, operationId) {
        const { repo, workflowId, branch, status } = operation.params;
        if (!repo) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for getWorkflowRuns', false);
        }
        const result = {
            success: true,
            data: {
                workflowRuns: [],
                totalCount: 0,
                filters: { repo, workflowId, branch, status },
                retrievedAt: new Date().toISOString(),
            },
            retryable: false,
            operationId,
        };
        this._completedOperations.set(operationId, result);
        return result;
    }
    async handleTriggerWorkflow(operation, operationId) {
        const { repo, workflowId, ref, inputs } = operation.params;
        if (!repo) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for triggerWorkflow', false);
        }
        if (!workflowId) {
            return this.errorResult(operationId, exports.GITHUB_ERROR_CODES.INVALID_PARAMS, 'workflowId is required for triggerWorkflow', false);
        }
        const result = {
            success: true,
            data: {
                workflowId,
                repo,
                ref: ref ?? 'main',
                inputs: inputs ?? {},
                triggeredAt: new Date().toISOString(),
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
        return `github-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
exports.GitHubDriver = GitHubDriver;
//# sourceMappingURL=github-driver.js.map
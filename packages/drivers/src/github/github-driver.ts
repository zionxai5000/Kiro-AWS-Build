/**
 * GitHub API Driver — repository, PR, issue, and workflow management via GitHub API.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for personal
 * access token / GitHub App authentication, and implements all GitHub operations.
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

export const GITHUB_ERROR_CODES = {
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
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubRepo {
  id: string;
  name: string;
  fullName: string;
  description: string;
  private: boolean;
  defaultBranch: string;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export interface GitHubPullRequest {
  id: string;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  head: string;
  base: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  htmlUrl: string;
}

export interface GitHubIssue {
  id: string;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  htmlUrl: string;
}

export interface GitHubWorkflowRun {
  id: string;
  workflowId: string;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  branch: string;
  event: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GitHubDriverConfig {
  /** GitHub personal access token or GitHub App installation token key name. */
  tokenKeyName: string;
  /** The GitHub owner (user or organization). */
  owner: string;
  /** Optional API base URL for GitHub Enterprise. */
  apiBaseUrl?: string;
}

// ---------------------------------------------------------------------------
// GitHub Driver
// ---------------------------------------------------------------------------

export class GitHubDriver extends BaseDriver<GitHubDriverConfig> {
  readonly name = 'github';
  readonly version = '1.0.0';

  private _token: string | null = null;
  private _driverConfig: GitHubDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    super();
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: GitHubDriverConfig): Promise<void> {
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

  protected async doDisconnect(): Promise<void> {
    this._token = null;
    this._driverConfig = null;
    this._completedOperations.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOpId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
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
        return this.errorResult(
          operationId,
          GITHUB_ERROR_CODES.UNSUPPORTED_OPERATION,
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

  private async handleCreateRepo(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { name, description, isPrivate, autoInit } = operation.params as {
      name?: string;
      description?: string;
      isPrivate?: boolean;
      autoInit?: boolean;
    };

    if (!name) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'name is required for createRepo', false);
    }

    const repo: GitHubRepo = {
      id: `repo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      fullName: `${this._driverConfig!.owner}/${name}`,
      description: description ?? '',
      private: isPrivate ?? false,
      defaultBranch: 'main',
      language: null,
      stargazersCount: 0,
      forksCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      htmlUrl: `https://github.com/${this._driverConfig!.owner}/${name}`,
    };

    const result: DriverResult = {
      success: true,
      data: repo,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleCreatePR(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { repo, title, body, head, base } = operation.params as {
      repo?: string;
      title?: string;
      body?: string;
      head?: string;
      base?: string;
    };

    if (!repo) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for createPR', false);
    }
    if (!title) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'title is required for createPR', false);
    }
    if (!head) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'head branch is required for createPR', false);
    }

    const pr: GitHubPullRequest = {
      id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      number: Math.floor(Math.random() * 10000) + 1,
      title,
      body: body ?? '',
      state: 'open',
      head,
      base: base ?? 'main',
      author: this._driverConfig!.owner,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      htmlUrl: `https://github.com/${this._driverConfig!.owner}/${repo}/pull/${Math.floor(Math.random() * 10000)}`,
    };

    const result: DriverResult = {
      success: true,
      data: pr,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleMergePR(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { repo, pullNumber, mergeMethod } = operation.params as {
      repo?: string;
      pullNumber?: number;
      mergeMethod?: 'merge' | 'squash' | 'rebase';
    };

    if (!repo) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for mergePR', false);
    }
    if (!pullNumber) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'pullNumber is required for mergePR', false);
    }

    const result: DriverResult = {
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

  private async handleCreateIssue(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { repo, title, body, labels, assignees } = operation.params as {
      repo?: string;
      title?: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
    };

    if (!repo) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for createIssue', false);
    }
    if (!title) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'title is required for createIssue', false);
    }

    const issue: GitHubIssue = {
      id: `issue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      number: Math.floor(Math.random() * 10000) + 1,
      title,
      body: body ?? '',
      state: 'open',
      labels: labels ?? [],
      assignees: assignees ?? [],
      author: this._driverConfig!.owner,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      htmlUrl: `https://github.com/${this._driverConfig!.owner}/${repo}/issues/${Math.floor(Math.random() * 10000)}`,
    };

    const result: DriverResult = {
      success: true,
      data: issue,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleCloseIssue(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { repo, issueNumber } = operation.params as {
      repo?: string;
      issueNumber?: number;
    };

    if (!repo) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for closeIssue', false);
    }
    if (!issueNumber) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'issueNumber is required for closeIssue', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        issueNumber,
        repo,
        state: 'closed' as const,
        closedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleListRepos(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { page, perPage, sort } = operation.params as {
      page?: number;
      perPage?: number;
      sort?: 'created' | 'updated' | 'pushed' | 'full_name';
    };

    const result: DriverResult = {
      success: true,
      data: {
        repos: [] as GitHubRepo[],
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

  private async handleGetWorkflowRuns(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { repo, workflowId, branch, status } = operation.params as {
      repo?: string;
      workflowId?: string;
      branch?: string;
      status?: string;
    };

    if (!repo) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for getWorkflowRuns', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        workflowRuns: [] as GitHubWorkflowRun[],
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

  private async handleTriggerWorkflow(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { repo, workflowId, ref, inputs } = operation.params as {
      repo?: string;
      workflowId?: string;
      ref?: string;
      inputs?: Record<string, string>;
    };

    if (!repo) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'repo is required for triggerWorkflow', false);
    }
    if (!workflowId) {
      return this.errorResult(operationId, GITHUB_ERROR_CODES.INVALID_PARAMS, 'workflowId is required for triggerWorkflow', false);
    }

    const result: DriverResult = {
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

  private createOpId(): string {
    return `github-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

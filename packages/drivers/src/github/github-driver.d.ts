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
import type { DriverOperation, DriverResult, VerificationResult } from '@seraphim/core/types/driver.js';
import type { CredentialManager } from '@seraphim/core/interfaces/credential-manager.js';
export declare const GITHUB_ERROR_CODES: {
    readonly UNAUTHORIZED: "GITHUB_UNAUTHORIZED";
    readonly FORBIDDEN: "GITHUB_FORBIDDEN";
    readonly NOT_FOUND: "GITHUB_NOT_FOUND";
    readonly RATE_LIMITED: "GITHUB_RATE_LIMITED";
    readonly INVALID_PARAMS: "GITHUB_INVALID_PARAMS";
    readonly CONFLICT: "GITHUB_CONFLICT";
    readonly VALIDATION_FAILED: "GITHUB_VALIDATION_FAILED";
    readonly MERGE_CONFLICT: "GITHUB_MERGE_CONFLICT";
    readonly WORKFLOW_FAILED: "GITHUB_WORKFLOW_FAILED";
    readonly UNSUPPORTED_OPERATION: "GITHUB_UNSUPPORTED_OPERATION";
};
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
export interface GitHubDriverConfig {
    /** GitHub personal access token or GitHub App installation token key name. */
    tokenKeyName: string;
    /** The GitHub owner (user or organization). */
    owner: string;
    /** Optional API base URL for GitHub Enterprise. */
    apiBaseUrl?: string;
}
export declare class GitHubDriver extends BaseDriver<GitHubDriverConfig> {
    private readonly credentialManager;
    readonly name = "github";
    readonly version = "1.0.0";
    private _token;
    private _driverConfig;
    private readonly _completedOperations;
    constructor(credentialManager: CredentialManager);
    protected doConnect(config: GitHubDriverConfig): Promise<void>;
    protected doDisconnect(): Promise<void>;
    protected doExecute(operation: DriverOperation): Promise<DriverResult>;
    protected doVerify(operationId: string): Promise<VerificationResult>;
    private handleCreateRepo;
    private handleCreatePR;
    private handleMergePR;
    private handleCreateIssue;
    private handleCloseIssue;
    private handleListRepos;
    private handleGetWorkflowRuns;
    private handleTriggerWorkflow;
    private createOpId;
    private errorResult;
}
//# sourceMappingURL=github-driver.d.ts.map
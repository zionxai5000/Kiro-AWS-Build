/**
 * Reddit API Driver — post submission, comments, subreddit, and user management via Reddit API.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for OAuth2
 * authentication, and implements all Reddit operations.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.6, 12.1
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

export const REDDIT_ERROR_CODES = {
  UNAUTHORIZED: 'REDDIT_UNAUTHORIZED',
  FORBIDDEN: 'REDDIT_FORBIDDEN',
  NOT_FOUND: 'REDDIT_NOT_FOUND',
  RATE_LIMITED: 'REDDIT_RATE_LIMITED',
  INVALID_PARAMS: 'REDDIT_INVALID_PARAMS',
  SUBREDDIT_NOT_FOUND: 'REDDIT_SUBREDDIT_NOT_FOUND',
  POST_REMOVED: 'REDDIT_POST_REMOVED',
  COMMENT_FAILED: 'REDDIT_COMMENT_FAILED',
  UNSUPPORTED_OPERATION: 'REDDIT_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  url: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  createdUtc: number;
  permalink: string;
  isNsfw: boolean;
  flair?: string;
}

export interface RedditComment {
  id: string;
  postId: string;
  parentId: string;
  author: string;
  body: string;
  score: number;
  createdUtc: number;
  edited: boolean;
  depth: number;
}

export interface RedditSubreddit {
  id: string;
  name: string;
  displayName: string;
  title: string;
  description: string;
  subscribers: number;
  activeUsers: number;
  isNsfw: boolean;
  createdUtc: number;
}

export interface RedditUser {
  id: string;
  name: string;
  linkKarma: number;
  commentKarma: number;
  createdUtc: number;
  isGold: boolean;
  isMod: boolean;
  iconUrl: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RedditDriverConfig {
  /** The OAuth2 client ID key name in Credential Manager. */
  clientIdKeyName: string;
  /** The OAuth2 client secret key name in Credential Manager. */
  clientSecretKeyName: string;
  /** The Reddit username. */
  username: string;
}

// ---------------------------------------------------------------------------
// Reddit Driver
// ---------------------------------------------------------------------------

export class RedditDriver extends BaseDriver<RedditDriverConfig> {
  readonly name = 'reddit';
  readonly version = '1.0.0';

  private _accessToken: string | null = null;
  private _driverConfig: RedditDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    super();
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: RedditDriverConfig): Promise<void> {
    if (!config.clientIdKeyName) {
      throw new Error('Reddit OAuth2 client ID key name is required');
    }
    if (!config.clientSecretKeyName) {
      throw new Error('Reddit OAuth2 client secret key name is required');
    }
    if (!config.username) {
      throw new Error('Reddit username is required');
    }

    const clientId = await this.credentialManager.getCredential('reddit', config.clientIdKeyName);
    const clientSecret = await this.credentialManager.getCredential('reddit', config.clientSecretKeyName);
    if (!clientId || !clientSecret) {
      throw new Error('Failed to retrieve Reddit OAuth2 credentials from Credential Manager');
    }
    this._accessToken = `mock-reddit-token-${Date.now()}`;
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'reddit',
      authenticated: true,
      username: config.username,
    });
  }

  protected async doDisconnect(): Promise<void> {
    this._accessToken = null;
    this._driverConfig = null;
    this._completedOperations.clear();
  }

  // =====================================================================
  // Execute
  // =====================================================================

  protected async doExecute(operation: DriverOperation): Promise<DriverResult> {
    const operationId = this.createOpId();

    if (!this._driverConfig) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'submitPost':
        return this.handleSubmitPost(operation, operationId);
      case 'submitComment':
        return this.handleSubmitComment(operation, operationId);
      case 'getPost':
        return this.handleGetPost(operation, operationId);
      case 'getComments':
        return this.handleGetComments(operation, operationId);
      case 'getSubreddit':
        return this.handleGetSubreddit(operation, operationId);
      case 'getUserProfile':
        return this.handleGetUserProfile(operation, operationId);
      case 'getPostAnalytics':
        return this.handleGetPostAnalytics(operation, operationId);
      case 'deletePost':
        return this.handleDeletePost(operation, operationId);
      case 'editPost':
        return this.handleEditPost(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          REDDIT_ERROR_CODES.UNSUPPORTED_OPERATION,
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

  private async handleSubmitPost(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { subreddit, title, selftext, url, flair } = operation.params as {
      subreddit?: string;
      title?: string;
      selftext?: string;
      url?: string;
      flair?: string;
    };

    if (!subreddit) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.INVALID_PARAMS, 'subreddit is required for submitPost', false);
    }
    if (!title) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.INVALID_PARAMS, 'title is required for submitPost', false);
    }

    const post: RedditPost = {
      id: `reddit-post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      subreddit,
      title,
      selftext: selftext ?? '',
      author: this._driverConfig!.username,
      url: url ?? '',
      score: 1,
      upvoteRatio: 1.0,
      numComments: 0,
      createdUtc: Math.floor(Date.now() / 1000),
      permalink: `/r/${subreddit}/comments/mock/`,
      isNsfw: false,
      flair,
    };

    const result: DriverResult = {
      success: true,
      data: post,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleSubmitComment(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { postId, parentId, body } = operation.params as {
      postId?: string;
      parentId?: string;
      body?: string;
    };

    if (!postId) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.INVALID_PARAMS, 'postId is required for submitComment', false);
    }
    if (!body) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.INVALID_PARAMS, 'body is required for submitComment', false);
    }

    const comment: RedditComment = {
      id: `reddit-comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      postId,
      parentId: parentId ?? postId,
      author: this._driverConfig!.username,
      body,
      score: 1,
      createdUtc: Math.floor(Date.now() / 1000),
      edited: false,
      depth: parentId ? 1 : 0,
    };

    const result: DriverResult = {
      success: true,
      data: comment,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetPost(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { postId } = operation.params as { postId?: string };

    if (!postId) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.INVALID_PARAMS, 'postId is required for getPost', false);
    }

    const post: RedditPost = {
      id: postId,
      subreddit: 'mock_subreddit',
      title: 'Mock Post',
      selftext: 'Structural mock post content',
      author: 'mock_user',
      url: '',
      score: 0,
      upvoteRatio: 0,
      numComments: 0,
      createdUtc: Math.floor(Date.now() / 1000),
      permalink: `/r/mock_subreddit/comments/${postId}/`,
      isNsfw: false,
    };

    const result: DriverResult = {
      success: true,
      data: post,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetComments(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { postId, sort, limit } = operation.params as {
      postId?: string;
      sort?: string;
      limit?: number;
    };

    if (!postId) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.INVALID_PARAMS, 'postId is required for getComments', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        postId,
        comments: [] as RedditComment[],
        sort: sort ?? 'best',
        limit: limit ?? 25,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetSubreddit(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { subredditName } = operation.params as { subredditName?: string };

    if (!subredditName) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.INVALID_PARAMS, 'subredditName is required for getSubreddit', false);
    }

    const subreddit: RedditSubreddit = {
      id: `sr-${subredditName}`,
      name: subredditName,
      displayName: subredditName,
      title: `r/${subredditName}`,
      description: 'Structural mock subreddit',
      subscribers: 0,
      activeUsers: 0,
      isNsfw: false,
      createdUtc: Math.floor(Date.now() / 1000),
    };

    const result: DriverResult = {
      success: true,
      data: subreddit,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetUserProfile(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { username } = operation.params as { username?: string };

    const resolvedUsername = username ?? this._driverConfig!.username;

    const user: RedditUser = {
      id: `user-${resolvedUsername}`,
      name: resolvedUsername,
      linkKarma: 0,
      commentKarma: 0,
      createdUtc: Math.floor(Date.now() / 1000),
      isGold: false,
      isMod: false,
      iconUrl: `https://reddit.com/avatars/${resolvedUsername}.png`,
    };

    const result: DriverResult = {
      success: true,
      data: user,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetPostAnalytics(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { postId } = operation.params as { postId?: string };

    if (!postId) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.INVALID_PARAMS, 'postId is required for getPostAnalytics', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        postId,
        views: 0,
        upvotes: 0,
        downvotes: 0,
        upvoteRatio: 0,
        comments: 0,
        crossPosts: 0,
        awards: 0,
        generatedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleDeletePost(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { postId } = operation.params as { postId?: string };

    if (!postId) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.INVALID_PARAMS, 'postId is required for deletePost', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        postId,
        deleted: true,
        deletedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleEditPost(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { postId, selftext } = operation.params as {
      postId?: string;
      selftext?: string;
    };

    if (!postId) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.INVALID_PARAMS, 'postId is required for editPost', false);
    }
    if (!selftext) {
      return this.errorResult(operationId, REDDIT_ERROR_CODES.INVALID_PARAMS, 'selftext is required for editPost', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        postId,
        selftext,
        editedAt: new Date().toISOString(),
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
    return `reddit-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

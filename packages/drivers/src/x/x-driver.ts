/**
 * X (Twitter) API v2 Driver — tweet management, timeline, search, and analytics via X API v2.
 *
 * Structural/mock implementation that defines the correct interface,
 * handles operation types, wires up to CredentialManager for bearer token
 * and API key authentication, and implements all X operations.
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
// Constants
// ---------------------------------------------------------------------------

/** Maximum tweet length in characters. */
const MAX_TWEET_LENGTH = 280;

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

export const X_ERROR_CODES = {
  UNAUTHORIZED: 'X_UNAUTHORIZED',
  FORBIDDEN: 'X_FORBIDDEN',
  NOT_FOUND: 'X_NOT_FOUND',
  RATE_LIMITED: 'X_RATE_LIMITED',
  INVALID_PARAMS: 'X_INVALID_PARAMS',
  TWEET_TOO_LONG: 'X_TWEET_TOO_LONG',
  DUPLICATE_TWEET: 'X_DUPLICATE_TWEET',
  ACCOUNT_SUSPENDED: 'X_ACCOUNT_SUSPENDED',
  UNSUPPORTED_OPERATION: 'X_UNSUPPORTED_OPERATION',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface XTweet {
  id: string;
  text: string;
  authorId: string;
  conversationId: string;
  createdAt: string;
  publicMetrics: {
    retweetCount: number;
    replyCount: number;
    likeCount: number;
    quoteCount: number;
    impressionCount: number;
  };
  inReplyToUserId?: string;
}

export interface XUser {
  id: string;
  name: string;
  username: string;
  description: string;
  profileImageUrl: string;
  verified: boolean;
  publicMetrics: {
    followersCount: number;
    followingCount: number;
    tweetCount: number;
    listedCount: number;
  };
  createdAt: string;
}

export interface XAnalytics {
  tweetId: string;
  impressions: number;
  engagements: number;
  retweets: number;
  replies: number;
  likes: number;
  quotes: number;
  profileClicks: number;
  urlClicks: number;
  period: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface XDriverConfig {
  /** The bearer token key name in Credential Manager. */
  bearerTokenKeyName: string;
  /** The API key name in Credential Manager. */
  apiKeyName: string;
  /** The API secret key name in Credential Manager. */
  apiSecretKeyName: string;
}

// ---------------------------------------------------------------------------
// X Driver
// ---------------------------------------------------------------------------

export class XDriver extends BaseDriver<XDriverConfig> {
  readonly name = 'x';
  readonly version = '1.0.0';

  private _accessToken: string | null = null;
  private _driverConfig: XDriverConfig | null = null;
  private readonly _completedOperations = new Map<string, DriverResult>();

  constructor(private readonly credentialManager: CredentialManager) {
    super();
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  protected async doConnect(config: XDriverConfig): Promise<void> {
    if (!config.bearerTokenKeyName) {
      throw new Error('X API bearer token key name is required');
    }
    if (!config.apiKeyName) {
      throw new Error('X API key name is required');
    }
    if (!config.apiSecretKeyName) {
      throw new Error('X API secret key name is required');
    }

    this._accessToken = await this.credentialManager.getCredential('x', config.bearerTokenKeyName);
    if (!this._accessToken) {
      throw new Error('Failed to retrieve X API bearer token from Credential Manager');
    }
    this._driverConfig = config;

    this.updateSessionData({
      provider: 'x',
      authenticated: true,
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
      return this.errorResult(operationId, X_ERROR_CODES.UNAUTHORIZED, 'Driver is not connected', false);
    }

    switch (operation.type) {
      case 'createTweet':
        return this.handleCreateTweet(operation, operationId);
      case 'deleteTweet':
        return this.handleDeleteTweet(operation, operationId);
      case 'getTweet':
        return this.handleGetTweet(operation, operationId);
      case 'replyToTweet':
        return this.handleReplyToTweet(operation, operationId);
      case 'getUserTimeline':
        return this.handleGetUserTimeline(operation, operationId);
      case 'searchTweets':
        return this.handleSearchTweets(operation, operationId);
      case 'getAnalytics':
        return this.handleGetAnalytics(operation, operationId);
      case 'likeTweet':
        return this.handleLikeTweet(operation, operationId);
      case 'retweet':
        return this.handleRetweet(operation, operationId);
      default:
        return this.errorResult(
          operationId,
          X_ERROR_CODES.UNSUPPORTED_OPERATION,
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

  private async handleCreateTweet(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { text, mediaIds, pollOptions, pollDurationMinutes } = operation.params as {
      text?: string;
      mediaIds?: string[];
      pollOptions?: string[];
      pollDurationMinutes?: number;
    };

    if (!text) {
      return this.errorResult(operationId, X_ERROR_CODES.INVALID_PARAMS, 'text is required for createTweet', false);
    }
    if (text.length > MAX_TWEET_LENGTH) {
      return this.errorResult(
        operationId,
        X_ERROR_CODES.TWEET_TOO_LONG,
        `Tweet exceeds maximum length of ${MAX_TWEET_LENGTH} characters (got ${text.length})`,
        false,
      );
    }

    const tweet: XTweet = {
      id: `x-tweet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      authorId: 'self',
      conversationId: `conv-${Date.now()}`,
      createdAt: new Date().toISOString(),
      publicMetrics: {
        retweetCount: 0,
        replyCount: 0,
        likeCount: 0,
        quoteCount: 0,
        impressionCount: 0,
      },
    };

    const result: DriverResult = {
      success: true,
      data: tweet,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleDeleteTweet(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { tweetId } = operation.params as { tweetId?: string };

    if (!tweetId) {
      return this.errorResult(operationId, X_ERROR_CODES.INVALID_PARAMS, 'tweetId is required for deleteTweet', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        tweetId,
        deleted: true,
        deletedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetTweet(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { tweetId } = operation.params as { tweetId?: string };

    if (!tweetId) {
      return this.errorResult(operationId, X_ERROR_CODES.INVALID_PARAMS, 'tweetId is required for getTweet', false);
    }

    const tweet: XTweet = {
      id: tweetId,
      text: 'Mock tweet content',
      authorId: 'mock-author',
      conversationId: `conv-${tweetId}`,
      createdAt: new Date().toISOString(),
      publicMetrics: {
        retweetCount: 0,
        replyCount: 0,
        likeCount: 0,
        quoteCount: 0,
        impressionCount: 0,
      },
    };

    const result: DriverResult = {
      success: true,
      data: tweet,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleReplyToTweet(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { tweetId, text } = operation.params as {
      tweetId?: string;
      text?: string;
    };

    if (!tweetId) {
      return this.errorResult(operationId, X_ERROR_CODES.INVALID_PARAMS, 'tweetId is required for replyToTweet', false);
    }
    if (!text) {
      return this.errorResult(operationId, X_ERROR_CODES.INVALID_PARAMS, 'text is required for replyToTweet', false);
    }
    if (text.length > MAX_TWEET_LENGTH) {
      return this.errorResult(
        operationId,
        X_ERROR_CODES.TWEET_TOO_LONG,
        `Reply exceeds maximum length of ${MAX_TWEET_LENGTH} characters (got ${text.length})`,
        false,
      );
    }

    const reply: XTweet = {
      id: `x-reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      authorId: 'self',
      conversationId: `conv-${tweetId}`,
      createdAt: new Date().toISOString(),
      publicMetrics: {
        retweetCount: 0,
        replyCount: 0,
        likeCount: 0,
        quoteCount: 0,
        impressionCount: 0,
      },
      inReplyToUserId: 'mock-author',
    };

    const result: DriverResult = {
      success: true,
      data: reply,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetUserTimeline(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { userId, maxResults, paginationToken } = operation.params as {
      userId?: string;
      maxResults?: number;
      paginationToken?: string;
    };

    if (!userId) {
      return this.errorResult(operationId, X_ERROR_CODES.INVALID_PARAMS, 'userId is required for getUserTimeline', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        userId,
        tweets: [] as XTweet[],
        maxResults: maxResults ?? 10,
        nextToken: null,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleSearchTweets(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { query, maxResults, nextToken } = operation.params as {
      query?: string;
      maxResults?: number;
      nextToken?: string;
    };

    if (!query) {
      return this.errorResult(operationId, X_ERROR_CODES.INVALID_PARAMS, 'query is required for searchTweets', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        query,
        tweets: [] as XTweet[],
        maxResults: maxResults ?? 10,
        nextToken: null,
        resultCount: 0,
        retrievedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleGetAnalytics(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { tweetId, startDate, endDate } = operation.params as {
      tweetId?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!tweetId) {
      return this.errorResult(operationId, X_ERROR_CODES.INVALID_PARAMS, 'tweetId is required for getAnalytics', false);
    }

    const analytics: XAnalytics = {
      tweetId,
      impressions: 0,
      engagements: 0,
      retweets: 0,
      replies: 0,
      likes: 0,
      quotes: 0,
      profileClicks: 0,
      urlClicks: 0,
      period: `${startDate ?? 'all'} to ${endDate ?? 'now'}`,
      generatedAt: new Date().toISOString(),
    };

    const result: DriverResult = {
      success: true,
      data: analytics,
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleLikeTweet(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { tweetId } = operation.params as { tweetId?: string };

    if (!tweetId) {
      return this.errorResult(operationId, X_ERROR_CODES.INVALID_PARAMS, 'tweetId is required for likeTweet', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        tweetId,
        liked: true,
        likedAt: new Date().toISOString(),
      },
      retryable: false,
      operationId,
    };

    this._completedOperations.set(operationId, result);
    return result;
  }

  private async handleRetweet(operation: DriverOperation, operationId: string): Promise<DriverResult> {
    const { tweetId } = operation.params as { tweetId?: string };

    if (!tweetId) {
      return this.errorResult(operationId, X_ERROR_CODES.INVALID_PARAMS, 'tweetId is required for retweet', false);
    }

    const result: DriverResult = {
      success: true,
      data: {
        tweetId,
        retweeted: true,
        retweetedAt: new Date().toISOString(),
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
    return `x-op-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

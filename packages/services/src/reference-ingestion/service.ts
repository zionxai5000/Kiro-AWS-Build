/**
 * Reference Ingestion Service — URL intake, classification, and dispatch.
 *
 * Accepts a URL, classifies it as an Apple App Store, Google Play Store,
 * or YouTube channel reference, then dispatches to the appropriate analyzer.
 * Integrates with Mishmar for Execution Tokens, XO Audit for event recording,
 * and Event Bus for publishing ingestion events.
 */

import { randomUUID } from 'node:crypto';

import type { MishmarService, EventBusService, XOAuditService } from '@seraphim/core';
import type { SystemEvent } from '@seraphim/core';

import type {
  ReferenceIngestionService,
  ReferenceType,
  UrlClassification,
  IngestionResult,
  IngestionError,
  AppStoreAnalyzer,
  YouTubeChannelAnalyzer,
} from './types.js';

// ---------------------------------------------------------------------------
// URL Classification Patterns
// ---------------------------------------------------------------------------

const URL_PATTERNS: Array<{ pattern: RegExp; type: ReferenceType }> = [
  { pattern: /apps\.apple\.com/, type: 'app-store-ios' },
  { pattern: /play\.google\.com\/store\/apps/, type: 'app-store-android' },
  { pattern: /youtube\.com\/@/, type: 'youtube-channel' },
  { pattern: /youtube\.com\/channel\//, type: 'youtube-channel' },
];

const SUPPORTED_FORMATS = [
  'Apple App Store: https://apps.apple.com/...',
  'Google Play Store: https://play.google.com/store/apps/...',
  'YouTube Channel: https://youtube.com/@... or https://youtube.com/channel/...',
];

// ---------------------------------------------------------------------------
// Service Configuration
// ---------------------------------------------------------------------------

export interface ReferenceIngestionServiceConfig {
  mishmar: MishmarService;
  eventBus: EventBusService;
  xoAudit: XOAuditService;
  appStoreAnalyzer: AppStoreAnalyzer;
  youtubeChannelAnalyzer: YouTubeChannelAnalyzer;
  tenantId: string;
  agentId?: string;
  agentName?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ReferenceIngestionServiceImpl implements ReferenceIngestionService {
  private readonly mishmar: MishmarService;
  private readonly eventBus: EventBusService;
  private readonly xoAudit: XOAuditService;
  private readonly appStoreAnalyzer: AppStoreAnalyzer;
  private readonly youtubeChannelAnalyzer: YouTubeChannelAnalyzer;
  private readonly tenantId: string;
  private readonly agentId: string;
  private readonly agentName: string;

  constructor(config: ReferenceIngestionServiceConfig) {
    this.mishmar = config.mishmar;
    this.eventBus = config.eventBus;
    this.xoAudit = config.xoAudit;
    this.appStoreAnalyzer = config.appStoreAnalyzer;
    this.youtubeChannelAnalyzer = config.youtubeChannelAnalyzer;
    this.tenantId = config.tenantId;
    this.agentId = config.agentId ?? 'reference-ingestion-service';
    this.agentName = config.agentName ?? 'Reference Ingestion Service';
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async ingest(url: string): Promise<IngestionResult> {
    // Step 1: Validate URL format
    const validationError = this.validateUrl(url);
    if (validationError) {
      await this.publishFailureEvent(url, validationError.code, 'validation');
      throw new ReferenceIngestionError(validationError);
    }

    // Step 2: Classify URL
    const classification = this.classifyUrl(url);
    if (!classification) {
      const error: IngestionError = {
        code: 'UNSUPPORTED_URL',
        message: `URL type not supported. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
        supportedFormats: SUPPORTED_FORMATS,
      };
      await this.publishFailureEvent(url, 'UNSUPPORTED_URL', 'classification');
      throw new ReferenceIngestionError(error);
    }

    // Step 3: Request Execution Token from Mishmar
    let tokenId: string;
    try {
      const token = await this.mishmar.requestToken({
        agentId: this.agentId,
        action: 'reference-ingestion',
        target: url,
        authorityLevel: 'L4',
      });
      tokenId = token.tokenId;
    } catch (err) {
      const error: IngestionError = {
        code: 'TOKEN_DENIED',
        message: `Failed to obtain execution token: ${err instanceof Error ? err.message : String(err)}`,
      };
      await this.publishFailureEvent(url, 'TOKEN_DENIED', 'authorization');
      throw new ReferenceIngestionError(error);
    }

    // Step 4: Record ingestion event in XO Audit
    await this.recordIngestionEvent(url, classification.type, tokenId);

    // Step 5: Dispatch to appropriate analyzer
    try {
      const report = await this.dispatch(classification);

      // Step 6: Publish success event
      await this.publishSuccessEvent(url, classification.type, report);

      return {
        success: true,
        referenceType: classification.type,
        url,
        report,
      };
    } catch (err) {
      const error: IngestionError = {
        code: 'ANALYSIS_FAILED',
        message: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
      };
      await this.publishFailureEvent(url, 'ANALYSIS_FAILED', 'analysis');
      throw new ReferenceIngestionError(error);
    }
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private validateUrl(url: string): IngestionError | null {
    if (!url || typeof url !== 'string') {
      return {
        code: 'INVALID_URL',
        message: 'URL must be a non-empty string',
        supportedFormats: SUPPORTED_FORMATS,
      };
    }

    try {
      new URL(url);
    } catch {
      return {
        code: 'INVALID_URL',
        message: `Invalid URL format: "${url}"`,
        supportedFormats: SUPPORTED_FORMATS,
      };
    }

    return null;
  }

  private classifyUrl(url: string): UrlClassification | null {
    for (const { pattern, type } of URL_PATTERNS) {
      if (pattern.test(url)) {
        return { type, url };
      }
    }
    return null;
  }

  private async dispatch(classification: UrlClassification) {
    switch (classification.type) {
      case 'app-store-ios':
        return this.appStoreAnalyzer.analyze(classification.url, 'ios');
      case 'app-store-android':
        return this.appStoreAnalyzer.analyze(classification.url, 'android');
      case 'youtube-channel':
        return this.youtubeChannelAnalyzer.analyze(classification.url);
    }
  }

  private async recordIngestionEvent(
    url: string,
    type: ReferenceType,
    tokenId: string,
  ): Promise<void> {
    await this.xoAudit.recordAction({
      tenantId: this.tenantId,
      actingAgentId: this.agentId,
      actingAgentName: this.agentName,
      actionType: 'reference-ingestion',
      target: url,
      authorizationChain: [],
      executionTokens: [tokenId],
      outcome: 'success',
      details: {
        url,
        detectedType: type,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async publishSuccessEvent(
    url: string,
    type: ReferenceType,
    report: unknown,
  ): Promise<void> {
    const event: SystemEvent = {
      source: 'seraphim.reference-ingestion',
      type: 'reference.ingested',
      detail: {
        url,
        referenceType: type,
        analyzedAt: new Date().toISOString(),
        reportSummary: {
          type,
          url,
        },
      },
      metadata: {
        tenantId: this.tenantId,
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    };
    await this.eventBus.publish(event);
  }

  private async publishFailureEvent(
    url: string,
    reason: string,
    stage: string,
  ): Promise<void> {
    const event: SystemEvent = {
      source: 'seraphim.reference-ingestion',
      type: 'reference.ingestion.failed',
      detail: {
        url,
        reason,
        stage,
        timestamp: new Date().toISOString(),
      },
      metadata: {
        tenantId: this.tenantId,
        correlationId: randomUUID(),
        timestamp: new Date(),
      },
    };
    await this.eventBus.publish(event);
  }
}

// ---------------------------------------------------------------------------
// Error Class
// ---------------------------------------------------------------------------

export class ReferenceIngestionError extends Error {
  public readonly code: IngestionError['code'];
  public readonly supportedFormats?: string[];

  constructor(error: IngestionError) {
    super(error.message);
    this.name = 'ReferenceIngestionError';
    this.code = error.code;
    this.supportedFormats = error.supportedFormats;
  }
}

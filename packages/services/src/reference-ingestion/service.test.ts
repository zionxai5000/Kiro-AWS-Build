/**
 * Unit tests for Reference Ingestion Service.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { MishmarService, EventBusService, XOAuditService } from '@seraphim/core';
import type { ExecutionToken, SystemEvent } from '@seraphim/core';

import {
  ReferenceIngestionServiceImpl,
  ReferenceIngestionError,
} from './service.js';
import type {
  ReferenceIngestionServiceConfig,
  AppStoreAnalyzer,
  YouTubeChannelAnalyzer,
  AppReferenceReport,
  ChannelReferenceReport,
} from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockMishmar(): MishmarService {
  return {
    authorize: vi.fn().mockResolvedValue({ authorized: true, reason: 'ok', auditId: 'a1' }),
    checkAuthorityLevel: vi.fn().mockResolvedValue('L4'),
    requestToken: vi.fn().mockResolvedValue({
      tokenId: 'token-123',
      agentId: 'reference-ingestion-service',
      action: 'reference-ingestion',
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      issuedBy: 'mishmar',
    } satisfies ExecutionToken),
    validateToken: vi.fn().mockResolvedValue(true),
    validateCompletion: vi.fn().mockResolvedValue({ valid: true, violations: [], contractId: 'c1' }),
    validateSeparation: vi.fn().mockResolvedValue({ valid: true, violations: [] }),
  };
}

function createMockEventBus(): EventBusService {
  return {
    publish: vi.fn().mockResolvedValue('event-id-1'),
    publishBatch: vi.fn().mockResolvedValue(['event-id-1']),
    subscribe: vi.fn().mockResolvedValue('sub-1'),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    getDeadLetterMessages: vi.fn().mockResolvedValue([]),
    retryDeadLetter: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockXOAudit(): XOAuditService {
  return {
    recordAction: vi.fn().mockResolvedValue('audit-id-1'),
    recordGovernanceDecision: vi.fn().mockResolvedValue('audit-id-2'),
    recordStateTransition: vi.fn().mockResolvedValue('audit-id-3'),
    query: vi.fn().mockResolvedValue([]),
    verifyIntegrity: vi.fn().mockResolvedValue({ valid: true, recordId: 'r1', chainLength: 1 }),
  };
}

function createMockAppStoreAnalyzer(): AppStoreAnalyzer {
  return {
    analyze: vi.fn().mockResolvedValue({
      url: 'https://apps.apple.com/us/app/test-app/id123',
      type: 'app-store-ios',
      analyzedAt: new Date(),
      platform: 'ios',
      listing: {
        appName: 'Test App',
        developer: 'Test Dev',
        category: 'Productivity',
        rating: 4.5,
        reviewCount: 1000,
        pricingModel: 'freemium',
        iapOptions: ['Premium $9.99'],
        description: 'A test app',
        featureList: ['Feature 1'],
      },
      visualAnalysis: {
        screenCount: 5,
        layoutPatterns: ['grid'],
        colorUsage: ['blue', 'white'],
        typography: ['SF Pro'],
        navigationStructure: 'tab-bar',
        informationDensity: 'medium',
      },
      reviewInsights: {
        topPraisedFeatures: ['ease of use'],
        commonComplaints: ['crashes'],
        sentimentDistribution: { positive: 0.7, neutral: 0.2, negative: 0.1 },
        featureRequests: ['dark mode'],
      },
      inferredPatterns: {
        onboardingComplexity: 'simple',
        monetizationModel: 'freemium',
        notificationStrategy: 'moderate',
        interactionPatterns: ['swipe'],
        retentionMechanics: ['streaks'],
      },
    } satisfies AppReferenceReport),
  };
}

function createMockYouTubeAnalyzer(): YouTubeChannelAnalyzer {
  return {
    analyze: vi.fn().mockResolvedValue({
      url: 'https://youtube.com/@testchannel',
      type: 'youtube-channel',
      analyzedAt: new Date(),
      channelMetrics: {
        subscriberCount: 100000,
        totalVideos: 200,
        uploadFrequency: 3,
        avgViewsPerVideo: 50000,
        engagementRate: 0.05,
        growthTrajectory: 'growing',
      },
      videoBreakdowns: [],
      productionFormula: {
        commonHookPatterns: ['question'],
        optimalLengthRange: { min: 8, max: 15 },
        thumbnailRules: ['face close-up'],
        titlePatterns: ['How to...'],
        pacingRhythm: 'fast',
        engagementTriggers: ['CTA at 60%'],
      },
    } satisfies ChannelReferenceReport),
  };
}

function createConfig(
  overrides: Partial<ReferenceIngestionServiceConfig> = {},
): ReferenceIngestionServiceConfig {
  return {
    mishmar: createMockMishmar(),
    eventBus: createMockEventBus(),
    xoAudit: createMockXOAudit(),
    appStoreAnalyzer: createMockAppStoreAnalyzer(),
    youtubeChannelAnalyzer: createMockYouTubeAnalyzer(),
    tenantId: 'tenant-1',
    agentId: 'reference-ingestion-service',
    agentName: 'Reference Ingestion Service',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReferenceIngestionServiceImpl', () => {
  let config: ReferenceIngestionServiceConfig;
  let service: ReferenceIngestionServiceImpl;

  beforeEach(() => {
    config = createConfig();
    service = new ReferenceIngestionServiceImpl(config);
  });

  // -------------------------------------------------------------------------
  // URL Classification
  // -------------------------------------------------------------------------

  describe('URL classification', () => {
    it('classifies Apple App Store URLs as app-store-ios', async () => {
      const result = await service.ingest('https://apps.apple.com/us/app/test-app/id123456789');
      expect(result.referenceType).toBe('app-store-ios');
      expect(result.success).toBe(true);
    });

    it('classifies Google Play Store URLs as app-store-android', async () => {
      const result = await service.ingest('https://play.google.com/store/apps/details?id=com.test.app');
      expect(result.referenceType).toBe('app-store-android');
      expect(result.success).toBe(true);
    });

    it('classifies YouTube channel URLs with @ as youtube-channel', async () => {
      const result = await service.ingest('https://youtube.com/@testchannel');
      expect(result.referenceType).toBe('youtube-channel');
      expect(result.success).toBe(true);
    });

    it('classifies YouTube channel URLs with /channel/ as youtube-channel', async () => {
      const result = await service.ingest('https://youtube.com/channel/UC1234567890');
      expect(result.referenceType).toBe('youtube-channel');
      expect(result.success).toBe(true);
    });

    it('dispatches iOS App Store URLs to appStoreAnalyzer with platform ios', async () => {
      await service.ingest('https://apps.apple.com/us/app/test-app/id123456789');
      expect(config.appStoreAnalyzer.analyze).toHaveBeenCalledWith(
        'https://apps.apple.com/us/app/test-app/id123456789',
        'ios',
      );
    });

    it('dispatches Google Play URLs to appStoreAnalyzer with platform android', async () => {
      await service.ingest('https://play.google.com/store/apps/details?id=com.test.app');
      expect(config.appStoreAnalyzer.analyze).toHaveBeenCalledWith(
        'https://play.google.com/store/apps/details?id=com.test.app',
        'android',
      );
    });

    it('dispatches YouTube channel URLs to youtubeChannelAnalyzer', async () => {
      await service.ingest('https://youtube.com/@testchannel');
      expect(config.youtubeChannelAnalyzer.analyze).toHaveBeenCalledWith(
        'https://youtube.com/@testchannel',
      );
    });
  });

  // -------------------------------------------------------------------------
  // URL Validation & Error Handling
  // -------------------------------------------------------------------------

  describe('URL validation and error handling', () => {
    it('throws INVALID_URL for empty string', async () => {
      await expect(service.ingest('')).rejects.toThrow(ReferenceIngestionError);
      await expect(service.ingest('')).rejects.toMatchObject({
        code: 'INVALID_URL',
      });
    });

    it('throws INVALID_URL for malformed URLs', async () => {
      await expect(service.ingest('not-a-url')).rejects.toThrow(ReferenceIngestionError);
      await expect(service.ingest('not-a-url')).rejects.toMatchObject({
        code: 'INVALID_URL',
      });
    });

    it('throws UNSUPPORTED_URL for valid URLs that do not match any pattern', async () => {
      await expect(
        service.ingest('https://example.com/some-page'),
      ).rejects.toThrow(ReferenceIngestionError);

      try {
        await service.ingest('https://example.com/some-page');
      } catch (err) {
        expect(err).toBeInstanceOf(ReferenceIngestionError);
        const ingestionErr = err as ReferenceIngestionError;
        expect(ingestionErr.code).toBe('UNSUPPORTED_URL');
        expect(ingestionErr.supportedFormats).toBeDefined();
        expect(ingestionErr.supportedFormats!.length).toBeGreaterThan(0);
      }
    });

    it('includes supported formats list in UNSUPPORTED_URL error', async () => {
      try {
        await service.ingest('https://example.com/page');
      } catch (err) {
        const ingestionErr = err as ReferenceIngestionError;
        expect(ingestionErr.supportedFormats).toContain(
          'Apple App Store: https://apps.apple.com/...',
        );
        expect(ingestionErr.supportedFormats).toContain(
          'Google Play Store: https://play.google.com/store/apps/...',
        );
        expect(ingestionErr.supportedFormats).toContain(
          'YouTube Channel: https://youtube.com/@... or https://youtube.com/channel/...',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // Execution Token
  // -------------------------------------------------------------------------

  describe('Execution Token from Mishmar', () => {
    it('requests an Execution Token before dispatching', async () => {
      await service.ingest('https://apps.apple.com/us/app/test-app/id123');
      expect(config.mishmar.requestToken).toHaveBeenCalledWith({
        agentId: 'reference-ingestion-service',
        action: 'reference-ingestion',
        target: 'https://apps.apple.com/us/app/test-app/id123',
        authorityLevel: 'L4',
      });
    });

    it('throws TOKEN_DENIED when Mishmar rejects the token request', async () => {
      const mishmar = createMockMishmar();
      (mishmar.requestToken as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Insufficient authority'),
      );
      const svc = new ReferenceIngestionServiceImpl(createConfig({ mishmar }));

      await expect(
        svc.ingest('https://apps.apple.com/us/app/test-app/id123'),
      ).rejects.toMatchObject({
        code: 'TOKEN_DENIED',
      });
    });
  });

  // -------------------------------------------------------------------------
  // XO Audit Recording
  // -------------------------------------------------------------------------

  describe('XO Audit recording', () => {
    it('records ingestion event in XO Audit with URL, type, and timestamp', async () => {
      await service.ingest('https://apps.apple.com/us/app/test-app/id123');

      expect(config.xoAudit.recordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          actingAgentId: 'reference-ingestion-service',
          actingAgentName: 'Reference Ingestion Service',
          actionType: 'reference-ingestion',
          target: 'https://apps.apple.com/us/app/test-app/id123',
          executionTokens: ['token-123'],
          outcome: 'success',
          details: expect.objectContaining({
            url: 'https://apps.apple.com/us/app/test-app/id123',
            detectedType: 'app-store-ios',
            timestamp: expect.any(String),
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Event Bus Publishing
  // -------------------------------------------------------------------------

  describe('Event Bus publishing', () => {
    it('publishes reference.ingested event on successful analysis', async () => {
      await service.ingest('https://apps.apple.com/us/app/test-app/id123');

      expect(config.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.reference-ingestion',
          type: 'reference.ingested',
          detail: expect.objectContaining({
            url: 'https://apps.apple.com/us/app/test-app/id123',
            referenceType: 'app-store-ios',
          }),
          metadata: expect.objectContaining({
            tenantId: 'tenant-1',
          }),
        }),
      );
    });

    it('publishes reference.ingestion.failed event on analysis failure', async () => {
      const appStoreAnalyzer = createMockAppStoreAnalyzer();
      (appStoreAnalyzer.analyze as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Scraping failed'),
      );
      const eventBus = createMockEventBus();
      const svc = new ReferenceIngestionServiceImpl(
        createConfig({ appStoreAnalyzer, eventBus }),
      );

      await expect(
        svc.ingest('https://apps.apple.com/us/app/test-app/id123'),
      ).rejects.toThrow(ReferenceIngestionError);

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.reference-ingestion',
          type: 'reference.ingestion.failed',
          detail: expect.objectContaining({
            url: 'https://apps.apple.com/us/app/test-app/id123',
            reason: 'ANALYSIS_FAILED',
            stage: 'analysis',
          }),
        }),
      );
    });

    it('publishes reference.ingestion.failed event for unsupported URLs', async () => {
      try {
        await service.ingest('https://example.com/page');
      } catch {
        // expected
      }

      expect(config.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.reference-ingestion',
          type: 'reference.ingestion.failed',
          detail: expect.objectContaining({
            url: 'https://example.com/page',
            reason: 'UNSUPPORTED_URL',
            stage: 'classification',
          }),
        }),
      );
    });

    it('publishes reference.ingestion.failed event with reason and stage on token denial', async () => {
      const mishmar = createMockMishmar();
      (mishmar.requestToken as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Denied'),
      );
      const eventBus = createMockEventBus();
      const svc = new ReferenceIngestionServiceImpl(createConfig({ mishmar, eventBus }));

      try {
        await svc.ingest('https://apps.apple.com/us/app/test-app/id123');
      } catch {
        // expected
      }

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'seraphim.reference-ingestion',
          type: 'reference.ingestion.failed',
          detail: expect.objectContaining({
            reason: 'TOKEN_DENIED',
            stage: 'authorization',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Result Structure
  // -------------------------------------------------------------------------

  describe('result structure', () => {
    it('returns IngestionResult with report on success', async () => {
      const result = await service.ingest('https://apps.apple.com/us/app/test-app/id123');
      expect(result.success).toBe(true);
      expect(result.url).toBe('https://apps.apple.com/us/app/test-app/id123');
      expect(result.referenceType).toBe('app-store-ios');
      expect(result.report).toBeDefined();
    });
  });
});

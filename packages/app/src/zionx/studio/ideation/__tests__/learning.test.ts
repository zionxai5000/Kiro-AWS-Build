/**
 * Unit tests for ZionX Ideation Learning and Audit Integration
 *
 * Validates: Requirements 45f.20, 45f.21, 45f.22
 */

import { describe, it, expect } from 'vitest';
import {
  IdeationLearningEngineImpl,
  type XOAuditService,
  type ZikaronOutcomeStorage,
  type QualityBaselineProvider,
  type GTMIntegration,
  type DesignIntelligenceProvider,
  type AuditEntry,
  type OutcomeRecord,
  type AppPerformanceData,
  type IdeaScoreRecord,
} from '../learning.js';
import { NicheScoringAlgorithmImpl } from '../niche-scoring.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockAudit(): XOAuditService & { entries: AuditEntry[] } {
  const entries: AuditEntry[] = [];
  return {
    entries,
    async log(entry: AuditEntry) {
      entries.push(entry);
    },
  };
}

function createMockOutcomeStorage(): ZikaronOutcomeStorage & { records: OutcomeRecord[] } {
  const records: OutcomeRecord[] = [];
  return {
    records,
    async storeOutcome(record: OutcomeRecord) {
      records.push(record);
    },
    async loadOutcomes() {
      return records;
    },
  };
}

function createMockQualityBaseline(): QualityBaselineProvider {
  return {
    getBaseline(_category: string) {
      return { minRating: 4.0, minRetention: 0.3 };
    },
  };
}

function createMockGTM(): GTMIntegration & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async applyGTMAutomation(ideaId: string) {
      calls.push(ideaId);
    },
  };
}

function createMockDesignIntelligence(): DesignIntelligenceProvider {
  return {
    getDesignStandards(_category: string) {
      return { minDesignScore: 75, requiredPatterns: ['onboarding-flow', 'bottom-nav'] };
    },
  };
}

function createEngine() {
  const audit = createMockAudit();
  const storage = createMockOutcomeStorage();
  const scoring = new NicheScoringAlgorithmImpl();
  const qualityBaseline = createMockQualityBaseline();
  const gtm = createMockGTM();
  const designIntelligence = createMockDesignIntelligence();

  const engine = new IdeationLearningEngineImpl({
    auditService: audit,
    outcomeStorage: storage,
    scoringAlgorithm: scoring,
    qualityBaseline,
    gtmIntegration: gtm,
    designIntelligence,
  });

  return { engine, audit, storage, scoring, gtm, designIntelligence };
}

function createPerformanceData(overrides?: Partial<AppPerformanceData>): AppPerformanceData {
  return {
    ideaId: 'idea-1',
    appName: 'Test App',
    actualDownloads: 50000,
    actualRevenue: 5000,
    rating: 4.5,
    retentionRate: 0.4,
    publishedAt: new Date('2025-01-01'),
    measuredAt: new Date('2025-02-01'),
    ...overrides,
  };
}

function createScoreRecord(overrides?: Partial<IdeaScoreRecord>): IdeaScoreRecord {
  return {
    ideaId: 'idea-1',
    nicheScore: 72,
    factors: {
      marketSize: 70,
      competitionDensity: 60,
      revenuePotential: 80,
      technicalFeasibility: 75,
      growthTrend: 50,
      reviewGapScore: 65,
    },
    category: 'productivity',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IdeationLearningEngine', () => {
  describe('recordOutcome', () => {
    it('stores correct correlation between idea scoring and actual performance', async () => {
      const { engine, storage } = createEngine();

      const record = await engine.recordOutcome(
        createPerformanceData(),
        createScoreRecord(),
      );

      expect(record.ideaId).toBe('idea-1');
      expect(record.originalScore).toBe(72);
      expect(record.actualDownloads).toBe(50000);
      expect(record.actualRevenue).toBe(5000);
      expect(record.success).toBe(true);
      expect(record.correlationScore).toBeGreaterThanOrEqual(0);
      expect(record.correlationScore).toBeLessThanOrEqual(1);
      expect(storage.records).toHaveLength(1);
    });

    it('marks unsuccessful outcomes correctly', async () => {
      const { engine } = createEngine();

      const record = await engine.recordOutcome(
        createPerformanceData({ actualDownloads: 100, actualRevenue: 10 }),
        createScoreRecord(),
      );

      expect(record.success).toBe(false);
    });

    it('produces audit record for outcome recording', async () => {
      const { engine, audit } = createEngine();

      await engine.recordOutcome(createPerformanceData(), createScoreRecord());

      const outcomeAudit = audit.entries.find((e) => e.action === 'ideation.outcome_recorded');
      expect(outcomeAudit).toBeDefined();
      expect(outcomeAudit!.detail.ideaId).toBe('idea-1');
      expect(outcomeAudit!.detail.success).toBe(true);
    });

    it('includes days since publish in audit detail', async () => {
      const { engine, audit } = createEngine();

      await engine.recordOutcome(createPerformanceData(), createScoreRecord());

      const outcomeAudit = audit.entries.find((e) => e.action === 'ideation.outcome_recorded');
      expect(outcomeAudit!.detail.daysSincePublish).toBe(31);
    });
  });

  describe('calibrateWeights', () => {
    it('adjusts scoring weights based on outcome data', async () => {
      const { engine, storage, scoring } = createEngine();

      // Add some outcomes
      storage.records.push({
        id: 'r1',
        ideaId: 'idea-1',
        appName: 'App 1',
        originalScore: 80,
        originalFactors: { marketSize: 90, competitionDensity: 80, revenuePotential: 85, technicalFeasibility: 70, growthTrend: 60, reviewGapScore: 50 },
        actualDownloads: 100000,
        actualRevenue: 10000,
        success: true,
        correlationScore: 0.8,
        recordedAt: new Date(),
      });
      storage.records.push({
        id: 'r2',
        ideaId: 'idea-2',
        appName: 'App 2',
        originalScore: 40,
        originalFactors: { marketSize: 30, competitionDensity: 40, revenuePotential: 25, technicalFeasibility: 80, growthTrend: 20, reviewGapScore: 30 },
        actualDownloads: 500,
        actualRevenue: 50,
        success: false,
        correlationScore: 0.3,
        recordedAt: new Date(),
      });

      const beforeWeights = scoring.getWeights();
      await engine.calibrateWeights();
      const afterWeights = scoring.getWeights();

      // Weights should have changed
      const changed = Object.keys(beforeWeights).some(
        (k) => k !== 'lastCalibrated' && (beforeWeights as any)[k] !== (afterWeights as any)[k],
      );
      expect(changed).toBe(true);
    });

    it('does not calibrate when no outcomes exist', async () => {
      const { engine, scoring } = createEngine();

      const beforeWeights = scoring.getWeights();
      await engine.calibrateWeights();
      const afterWeights = scoring.getWeights();

      // Weights should remain unchanged (except lastCalibrated)
      expect(beforeWeights.marketSize).toBe(afterWeights.marketSize);
      expect(beforeWeights.revenuePotential).toBe(afterWeights.revenuePotential);
    });

    it('produces audit record for weight calibration', async () => {
      const { engine, storage, audit } = createEngine();

      storage.records.push({
        id: 'r1',
        ideaId: 'idea-1',
        appName: 'App 1',
        originalScore: 70,
        originalFactors: { marketSize: 70, competitionDensity: 60, revenuePotential: 70, technicalFeasibility: 60, growthTrend: 50, reviewGapScore: 50 },
        actualDownloads: 50000,
        actualRevenue: 5000,
        success: true,
        correlationScore: 0.7,
        recordedAt: new Date(),
      });

      await engine.calibrateWeights();

      const calibrationAudit = audit.entries.find((e) => e.action === 'ideation.weights_calibrated');
      expect(calibrationAudit).toBeDefined();
      expect(calibrationAudit!.detail.outcomesUsed).toBe(1);
      expect(calibrationAudit!.detail.successfulOutcomes).toBe(1);
      expect(calibrationAudit!.detail.failedOutcomes).toBe(0);
    });
  });

  describe('auditAction', () => {
    it('produces XO_Audit records with correct metadata and traceability', async () => {
      const { engine, audit } = createEngine();

      await engine.auditAction('research_cycle_completed', { categoriesScanned: 8 });

      expect(audit.entries).toHaveLength(1);
      const entry = audit.entries[0];
      expect(entry.action).toBe('ideation.research_cycle_completed');
      expect(entry.agentId).toBe('zionx-ideation-engine');
      expect(entry.source).toBe('zionx.ideation');
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.traceId).toBeDefined();
      expect(entry.detail.categoriesScanned).toBe(8);
    });

    it('logs niche scoring actions', async () => {
      const { engine, audit } = createEngine();

      await engine.auditAction('niche_scored', {
        niche: 'productivity-tools',
        compositeScore: 82,
        category: 'productivity',
      });

      const entry = audit.entries[0];
      expect(entry.action).toBe('ideation.niche_scored');
      expect(entry.detail.niche).toBe('productivity-tools');
      expect(entry.detail.compositeScore).toBe(82);
    });

    it('logs idea generation actions', async () => {
      const { engine, audit } = createEngine();

      await engine.auditAction('idea_generated', {
        ideaId: 'idea-42',
        name: 'Focus Timer Pro',
        source: 'autonomous',
        nicheScore: 78,
      });

      const entry = audit.entries[0];
      expect(entry.action).toBe('ideation.idea_generated');
      expect(entry.detail.ideaId).toBe('idea-42');
      expect(entry.detail.source).toBe('autonomous');
    });

    it('logs pipeline update actions', async () => {
      const { engine, audit } = createEngine();

      await engine.auditAction('pipeline_status_changed', {
        ideaId: 'idea-42',
        previousStatus: 'pipeline',
        newStatus: 'generating',
      });

      const entry = audit.entries[0];
      expect(entry.action).toBe('ideation.pipeline_status_changed');
      expect(entry.detail.previousStatus).toBe('pipeline');
      expect(entry.detail.newStatus).toBe('generating');
    });
  });

  describe('quality baseline and GTM integration', () => {
    it('pipeline ideas inherit ZionX quality baselines', async () => {
      const { engine } = createEngine();

      const result = await engine.applyQualityBaseline('idea-1', 'productivity');

      expect(result.meetsBaseline).toBe(true);
      expect(result.baseline.minRating).toBe(4.0);
      expect(result.baseline.minRetention).toBe(0.3);
    });

    it('detects when performance fails quality baseline', async () => {
      const { engine, audit } = createEngine();

      const result = await engine.applyQualityBaseline(
        'idea-1',
        'productivity',
        createPerformanceData({ rating: 3.2, retentionRate: 0.1 }),
      );

      expect(result.meetsBaseline).toBe(false);
      const failAudit = audit.entries.find((e) => e.action === 'ideation.quality_baseline_check_failed');
      expect(failAudit).toBeDefined();
    });

    it('passes when performance meets quality baseline', async () => {
      const { engine, audit } = createEngine();

      const result = await engine.applyQualityBaseline(
        'idea-1',
        'productivity',
        createPerformanceData({ rating: 4.5, retentionRate: 0.5 }),
      );

      expect(result.meetsBaseline).toBe(true);
      const passAudit = audit.entries.find((e) => e.action === 'ideation.quality_baseline_applied');
      expect(passAudit).toBeDefined();
    });

    it('GTM automation is applied to pipeline ideas', async () => {
      const { engine, gtm } = createEngine();

      await engine.applyGTMAutomation('idea-1');

      expect(gtm.calls).toContain('idea-1');
    });

    it('GTM automation produces audit record', async () => {
      const { engine, audit } = createEngine();

      await engine.applyGTMAutomation('idea-1');

      const gtmAudit = audit.entries.find((e) => e.action === 'ideation.gtm_automation_applied');
      expect(gtmAudit).toBeDefined();
      expect(gtmAudit!.detail.ideaId).toBe('idea-1');
    });
  });

  describe('design intelligence integration', () => {
    it('applies design intelligence standards to pipeline ideas', async () => {
      const { engine } = createEngine();

      const result = await engine.applyDesignIntelligence('idea-1', 'productivity');

      expect(result.meetsStandards).toBe(true);
      expect(result.standards.minDesignScore).toBe(75);
      expect(result.standards.requiredPatterns).toContain('onboarding-flow');
      expect(result.standards.requiredPatterns).toContain('bottom-nav');
    });

    it('produces audit record for design intelligence application', async () => {
      const { engine, audit } = createEngine();

      await engine.applyDesignIntelligence('idea-1', 'productivity');

      const designAudit = audit.entries.find((e) => e.action === 'ideation.design_intelligence_applied');
      expect(designAudit).toBeDefined();
      expect(designAudit!.detail.ideaId).toBe('idea-1');
      expect(designAudit!.detail.category).toBe('productivity');
    });

    it('uses default standards when no provider is configured', async () => {
      const audit = createMockAudit();
      const storage = createMockOutcomeStorage();
      const scoring = new NicheScoringAlgorithmImpl();

      const engine = new IdeationLearningEngineImpl({
        auditService: audit,
        outcomeStorage: storage,
        scoringAlgorithm: scoring,
        // No designIntelligence provider
      });

      const result = await engine.applyDesignIntelligence('idea-1', 'productivity');

      expect(result.meetsStandards).toBe(true);
      expect(result.standards.minDesignScore).toBe(70);
      expect(result.standards.requiredPatterns).toEqual([]);
    });
  });

  describe('getOutcomeHistory', () => {
    it('returns all stored outcome records', async () => {
      const { engine, storage } = createEngine();

      storage.records.push({
        id: 'r1',
        ideaId: 'idea-1',
        appName: 'App 1',
        originalScore: 70,
        originalFactors: { marketSize: 70, competitionDensity: 60, revenuePotential: 70, technicalFeasibility: 60, growthTrend: 50, reviewGapScore: 50 },
        actualDownloads: 50000,
        actualRevenue: 5000,
        success: true,
        correlationScore: 0.7,
        recordedAt: new Date(),
      });

      const history = await engine.getOutcomeHistory();
      expect(history).toHaveLength(1);
      expect(history[0].ideaId).toBe('idea-1');
    });
  });
});

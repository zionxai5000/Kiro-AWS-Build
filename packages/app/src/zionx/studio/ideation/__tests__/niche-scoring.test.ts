/**
 * Unit tests for ZionX Niche Scoring Algorithm
 *
 * Validates: Requirements 45b.5, 45b.6, 45b.7
 */

import { describe, it, expect } from 'vitest';
import {
  NicheScoringAlgorithmImpl,
  type NicheInput,
  type HistoricalOutcome,
  type ScoringWeights,
  type ZikaronWeightStorage,
} from '../niche-scoring.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockStorage(): ZikaronWeightStorage & { saved: any[] } {
  const saved: any[] = [];
  return {
    saved,
    async loadWeights() { return null; },
    async saveWeights(weights: ScoringWeights) { saved.push(weights); },
    async loadOutcomes() { return []; },
  };
}

function createNicheInput(overrides?: Partial<NicheInput>): NicheInput {
  return {
    name: 'test-niche',
    category: 'productivity',
    marketSize: 70,
    competitionDensity: 40,
    revenuePotential: 80,
    technicalFeasibility: 60,
    growthTrend: 50,
    reviewGapScore: 65,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NicheScoringAlgorithm', () => {
  describe('scoreNiche', () => {
    it('normalizes composite score to 0-100 range', () => {
      const algo = new NicheScoringAlgorithmImpl();

      const score = algo.scoreNiche(createNicheInput());

      expect(score.compositeScore).toBeGreaterThanOrEqual(0);
      expect(score.compositeScore).toBeLessThanOrEqual(100);
    });

    it('produces per-factor breakdown that sums to composite score', () => {
      const algo = new NicheScoringAlgorithmImpl();
      const weights = algo.getWeights();

      const score = algo.scoreNiche(createNicheInput());
      const { breakdown } = score;

      const expectedComposite =
        breakdown.marketSize * weights.marketSize +
        breakdown.competitionDensity * weights.competitionDensity +
        breakdown.revenuePotential * weights.revenuePotential +
        breakdown.technicalFeasibility * weights.technicalFeasibility +
        breakdown.growthTrend * weights.growthTrend +
        breakdown.reviewGapScore * weights.reviewGapScore;

      expect(score.compositeScore).toBeCloseTo(Math.round(expectedComposite * 100) / 100, 1);
    });

    it('inversely weights competition density (lower competition = higher score)', () => {
      const algo = new NicheScoringAlgorithmImpl();

      const lowCompetition = algo.scoreNiche(createNicheInput({ competitionDensity: 20 }));
      const highCompetition = algo.scoreNiche(createNicheInput({ competitionDensity: 80 }));

      expect(lowCompetition.compositeScore).toBeGreaterThan(highCompetition.compositeScore);
      // In breakdown, low competition input should yield higher breakdown score
      expect(lowCompetition.breakdown.competitionDensity).toBeGreaterThan(
        highCompetition.breakdown.competitionDensity,
      );
    });

    it('clamps input values to 0-100 range', () => {
      const algo = new NicheScoringAlgorithmImpl();

      const score = algo.scoreNiche(createNicheInput({
        marketSize: 150,
        competitionDensity: -10,
        revenuePotential: 200,
      }));

      expect(score.breakdown.marketSize).toBeLessThanOrEqual(100);
      expect(score.breakdown.competitionDensity).toBeLessThanOrEqual(100);
      expect(score.breakdown.revenuePotential).toBeLessThanOrEqual(100);
      expect(score.compositeScore).toBeLessThanOrEqual(100);
    });

    it('returns niche name and category in score result', () => {
      const algo = new NicheScoringAlgorithmImpl();

      const score = algo.scoreNiche(createNicheInput({ name: 'fitness-tracker', category: 'health' }));

      expect(score.niche).toBe('fitness-tracker');
      expect(score.category).toBe('health');
    });
  });

  describe('batchScoreNiches', () => {
    it('produces consistent results with single scoring', () => {
      const algo = new NicheScoringAlgorithmImpl();
      const input = createNicheInput();

      const singleScore = algo.scoreNiche(input);
      const batchScores = algo.batchScoreNiches([input]);

      expect(batchScores[0].compositeScore).toBe(singleScore.compositeScore);
      expect(batchScores[0].breakdown).toEqual(singleScore.breakdown);
    });

    it('ranks niches by composite score descending', () => {
      const algo = new NicheScoringAlgorithmImpl();

      const inputs: NicheInput[] = [
        createNicheInput({ name: 'low', marketSize: 20, revenuePotential: 20 }),
        createNicheInput({ name: 'high', marketSize: 90, revenuePotential: 90 }),
        createNicheInput({ name: 'mid', marketSize: 50, revenuePotential: 50 }),
      ];

      const scores = algo.batchScoreNiches(inputs);

      expect(scores[0].niche).toBe('high');
      expect(scores[0].rank).toBe(1);
      expect(scores[1].rank).toBe(2);
      expect(scores[2].niche).toBe('low');
      expect(scores[2].rank).toBe(3);
    });

    it('assigns sequential ranks starting from 1', () => {
      const algo = new NicheScoringAlgorithmImpl();

      const inputs = [
        createNicheInput({ name: 'a' }),
        createNicheInput({ name: 'b' }),
        createNicheInput({ name: 'c' }),
      ];

      const scores = algo.batchScoreNiches(inputs);
      const ranks = scores.map((s) => s.rank);

      expect(ranks).toContain(1);
      expect(ranks).toContain(2);
      expect(ranks).toContain(3);
    });
  });

  describe('updateWeights', () => {
    it('adjusts scoring weights based on historical outcomes', async () => {
      const storage = createMockStorage();
      const algo = new NicheScoringAlgorithmImpl(storage);
      const originalWeights = algo.getWeights();

      const outcomes: HistoricalOutcome[] = [
        {
          nicheCategory: 'productivity',
          actualDownloads: 100000,
          actualRevenue: 5000,
          predictedScore: 75,
          factors: { marketSize: 90, competitionDensity: 80, revenuePotential: 85, technicalFeasibility: 70, growthTrend: 60, reviewGapScore: 50 },
          success: true,
        },
        {
          nicheCategory: 'games',
          actualDownloads: 1000,
          actualRevenue: 100,
          predictedScore: 60,
          factors: { marketSize: 30, competitionDensity: 40, revenuePotential: 25, technicalFeasibility: 80, growthTrend: 20, reviewGapScore: 30 },
          success: false,
        },
      ];

      await algo.updateWeights(outcomes);

      const newWeights = algo.getWeights();
      // Weights should have changed
      const weightsChanged = Object.keys(originalWeights).some(
        (key) => key !== 'lastCalibrated' && (originalWeights as any)[key] !== (newWeights as any)[key],
      );
      expect(weightsChanged).toBe(true);
      expect(newWeights.lastCalibrated.getTime()).toBeGreaterThanOrEqual(originalWeights.lastCalibrated.getTime());
    });

    it('niches with previous ZionX success receive higher feasibility scores', async () => {
      const storage = createMockStorage();
      const algo = new NicheScoringAlgorithmImpl(storage);

      // Outcomes where high technical feasibility correlated with success
      const outcomes: HistoricalOutcome[] = [
        {
          nicheCategory: 'productivity',
          actualDownloads: 50000,
          actualRevenue: 3000,
          predictedScore: 70,
          factors: { marketSize: 60, competitionDensity: 50, revenuePotential: 60, technicalFeasibility: 95, growthTrend: 50, reviewGapScore: 50 },
          success: true,
        },
        {
          nicheCategory: 'games',
          actualDownloads: 500,
          actualRevenue: 10,
          predictedScore: 50,
          factors: { marketSize: 60, competitionDensity: 50, revenuePotential: 60, technicalFeasibility: 20, growthTrend: 50, reviewGapScore: 50 },
          success: false,
        },
      ];

      const beforeWeights = algo.getWeights();
      await algo.updateWeights(outcomes);
      const afterWeights = algo.getWeights();

      // Technical feasibility weight should increase since successful outcomes had higher values
      expect(afterWeights.technicalFeasibility).toBeGreaterThan(beforeWeights.technicalFeasibility);
    });

    it('persists updated weights to storage', async () => {
      const storage = createMockStorage();
      const algo = new NicheScoringAlgorithmImpl(storage);

      const outcomes: HistoricalOutcome[] = [
        {
          nicheCategory: 'test',
          actualDownloads: 10000,
          actualRevenue: 1000,
          predictedScore: 60,
          factors: { marketSize: 70, competitionDensity: 50, revenuePotential: 70, technicalFeasibility: 60, growthTrend: 50, reviewGapScore: 50 },
          success: true,
        },
      ];

      await algo.updateWeights(outcomes);

      expect(storage.saved.length).toBe(1);
      expect(storage.saved[0].lastCalibrated).toBeInstanceOf(Date);
    });

    it('does not modify weights when no outcomes provided', async () => {
      const algo = new NicheScoringAlgorithmImpl();
      const before = algo.getWeights();

      await algo.updateWeights([]);

      const after = algo.getWeights();
      expect(after.marketSize).toBe(before.marketSize);
      expect(after.revenuePotential).toBe(before.revenuePotential);
    });
  });

  describe('getWeights', () => {
    it('returns current scoring weights with last calibration date', () => {
      const algo = new NicheScoringAlgorithmImpl();

      const weights = algo.getWeights();

      expect(weights.marketSize).toBeGreaterThan(0);
      expect(weights.competitionDensity).toBeGreaterThan(0);
      expect(weights.revenuePotential).toBeGreaterThan(0);
      expect(weights.technicalFeasibility).toBeGreaterThan(0);
      expect(weights.growthTrend).toBeGreaterThan(0);
      expect(weights.reviewGapScore).toBeGreaterThan(0);
      expect(weights.lastCalibrated).toBeInstanceOf(Date);
    });

    it('weights sum to approximately 1.0', () => {
      const algo = new NicheScoringAlgorithmImpl();
      const weights = algo.getWeights();

      const sum =
        weights.marketSize +
        weights.competitionDensity +
        weights.revenuePotential +
        weights.technicalFeasibility +
        weights.growthTrend +
        weights.reviewGapScore;

      expect(sum).toBeCloseTo(1.0, 2);
    });
  });
});

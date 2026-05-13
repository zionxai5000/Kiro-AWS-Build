/**
 * ZionX Autonomous App Ideation Engine — Niche Scoring Algorithm
 *
 * Computes composite scores (0-100) for identified niches using weighted
 * factors: market size, competition density (inverse), revenue potential,
 * technical feasibility, growth trend, and review gap score. Supports
 * weight calibration from historical outcomes stored in Zikaron.
 *
 * Requirements: 45b.5, 45b.6, 45b.7
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NicheInput {
  name: string;
  category: string;
  marketSize: number;
  competitionDensity: number;
  revenuePotential: number;
  technicalFeasibility: number;
  growthTrend: number;
  reviewGapScore: number;
}

export interface ScoreBreakdown {
  marketSize: number;
  competitionDensity: number;
  revenuePotential: number;
  technicalFeasibility: number;
  growthTrend: number;
  reviewGapScore: number;
}

export interface NicheScore {
  niche: string;
  category: string;
  compositeScore: number;
  breakdown: ScoreBreakdown;
  rank?: number;
}

export interface ScoringWeights {
  marketSize: number;
  competitionDensity: number;
  revenuePotential: number;
  technicalFeasibility: number;
  growthTrend: number;
  reviewGapScore: number;
  lastCalibrated: Date;
}

export interface HistoricalOutcome {
  nicheCategory: string;
  actualDownloads: number;
  actualRevenue: number;
  predictedScore: number;
  factors: ScoreBreakdown;
  success: boolean;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces
// ---------------------------------------------------------------------------

export interface ZikaronWeightStorage {
  loadWeights(): Promise<ScoringWeights | null>;
  saveWeights(weights: ScoringWeights): Promise<void>;
  loadOutcomes(): Promise<HistoricalOutcome[]>;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface NicheScoringAlgorithm {
  scoreNiche(input: NicheInput): NicheScore;
  batchScoreNiches(inputs: NicheInput[]): NicheScore[];
  updateWeights(outcomes: HistoricalOutcome[]): Promise<void>;
  getWeights(): ScoringWeights;
}

// ---------------------------------------------------------------------------
// Default Weights
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHTS: ScoringWeights = {
  marketSize: 0.20,
  competitionDensity: 0.20,
  revenuePotential: 0.25,
  technicalFeasibility: 0.15,
  growthTrend: 0.10,
  reviewGapScore: 0.10,
  lastCalibrated: new Date(),
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class NicheScoringAlgorithmImpl implements NicheScoringAlgorithm {
  private weights: ScoringWeights;
  private readonly storage: ZikaronWeightStorage | null;

  constructor(storage?: ZikaronWeightStorage, initialWeights?: ScoringWeights) {
    this.storage = storage ?? null;
    this.weights = initialWeights ?? { ...DEFAULT_WEIGHTS };
  }

  /**
   * Compute composite score (0-100) from weighted factors.
   * Competition density is inversely weighted (lower competition = higher score).
   * Requirement 45b.5, 45b.6
   */
  scoreNiche(input: NicheInput): NicheScore {
    const breakdown = this.computeBreakdown(input);
    const compositeScore = this.computeComposite(breakdown);

    return {
      niche: input.name,
      category: input.category,
      compositeScore,
      breakdown,
    };
  }

  /**
   * Score multiple niches in parallel with consistent weighting.
   * Requirement 45b.5
   */
  batchScoreNiches(inputs: NicheInput[]): NicheScore[] {
    const scores = inputs.map((input) => this.scoreNiche(input));

    // Sort by composite score descending and assign ranks
    scores.sort((a, b) => b.compositeScore - a.compositeScore);
    scores.forEach((score, index) => {
      score.rank = index + 1;
    });

    return scores;
  }

  /**
   * Adjust scoring weights based on historical outcomes stored in Zikaron.
   * Ideas that succeeded get their niche factors weighted higher.
   * Requirement 45b.7
   */
  async updateWeights(outcomes: HistoricalOutcome[]): Promise<void> {
    if (outcomes.length === 0) return;

    const successfulOutcomes = outcomes.filter((o) => o.success);
    const failedOutcomes = outcomes.filter((o) => !o.success);

    if (successfulOutcomes.length === 0) return;

    // Calculate average factor values for successful vs failed outcomes
    const successAvg = this.averageFactors(successfulOutcomes);
    const failedAvg = failedOutcomes.length > 0
      ? this.averageFactors(failedOutcomes)
      : null;

    // Adjust weights: increase weight for factors that are higher in successful outcomes
    const factors: (keyof ScoreBreakdown)[] = [
      'marketSize',
      'competitionDensity',
      'revenuePotential',
      'technicalFeasibility',
      'growthTrend',
      'reviewGapScore',
    ];

    const adjustments: Record<string, number> = {};
    for (const factor of factors) {
      const successVal = successAvg[factor];
      const failedVal = failedAvg ? failedAvg[factor] : 50;
      // If successful outcomes have higher values for this factor, increase its weight
      const diff = (successVal - failedVal) / 100;
      adjustments[factor] = diff * 0.1; // Small adjustment per calibration
    }

    // Apply adjustments
    for (const factor of factors) {
      this.weights[factor] = Math.max(0.05, Math.min(0.40, this.weights[factor] + (adjustments[factor] ?? 0)));
    }

    // Normalize weights to sum to 1.0
    this.normalizeWeights();
    this.weights.lastCalibrated = new Date();

    // Persist updated weights
    if (this.storage) {
      await this.storage.saveWeights(this.weights);
    }
  }

  /**
   * Return current scoring weights with last calibration date.
   * Requirement 45b.6
   */
  getWeights(): ScoringWeights {
    return { ...this.weights };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private computeBreakdown(input: NicheInput): ScoreBreakdown {
    // Normalize each factor to 0-100 scale
    const marketSize = this.clamp(input.marketSize, 0, 100);
    // Competition density is INVERSELY weighted: lower competition = higher score
    const competitionDensity = this.clamp(100 - input.competitionDensity, 0, 100);
    const revenuePotential = this.clamp(input.revenuePotential, 0, 100);
    const technicalFeasibility = this.clamp(input.technicalFeasibility, 0, 100);
    const growthTrend = this.clamp(input.growthTrend, 0, 100);
    const reviewGapScore = this.clamp(input.reviewGapScore, 0, 100);

    return {
      marketSize,
      competitionDensity,
      revenuePotential,
      technicalFeasibility,
      growthTrend,
      reviewGapScore,
    };
  }

  private computeComposite(breakdown: ScoreBreakdown): number {
    const weighted =
      breakdown.marketSize * this.weights.marketSize +
      breakdown.competitionDensity * this.weights.competitionDensity +
      breakdown.revenuePotential * this.weights.revenuePotential +
      breakdown.technicalFeasibility * this.weights.technicalFeasibility +
      breakdown.growthTrend * this.weights.growthTrend +
      breakdown.reviewGapScore * this.weights.reviewGapScore;

    return this.clamp(Math.round(weighted * 100) / 100, 0, 100);
  }

  private normalizeWeights(): void {
    const factors: (keyof ScoreBreakdown)[] = [
      'marketSize',
      'competitionDensity',
      'revenuePotential',
      'technicalFeasibility',
      'growthTrend',
      'reviewGapScore',
    ];

    const sum = factors.reduce((s, f) => s + this.weights[f], 0);
    if (sum > 0) {
      for (const factor of factors) {
        this.weights[factor] = this.weights[factor] / sum;
      }
    }
  }

  private averageFactors(outcomes: HistoricalOutcome[]): ScoreBreakdown {
    const sum: ScoreBreakdown = {
      marketSize: 0,
      competitionDensity: 0,
      revenuePotential: 0,
      technicalFeasibility: 0,
      growthTrend: 0,
      reviewGapScore: 0,
    };

    for (const outcome of outcomes) {
      sum.marketSize += outcome.factors.marketSize;
      sum.competitionDensity += outcome.factors.competitionDensity;
      sum.revenuePotential += outcome.factors.revenuePotential;
      sum.technicalFeasibility += outcome.factors.technicalFeasibility;
      sum.growthTrend += outcome.factors.growthTrend;
      sum.reviewGapScore += outcome.factors.reviewGapScore;
    }

    const count = outcomes.length;
    return {
      marketSize: sum.marketSize / count,
      competitionDensity: sum.competitionDensity / count,
      revenuePotential: sum.revenuePotential / count,
      technicalFeasibility: sum.technicalFeasibility / count,
      growthTrend: sum.growthTrend / count,
      reviewGapScore: sum.reviewGapScore / count,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

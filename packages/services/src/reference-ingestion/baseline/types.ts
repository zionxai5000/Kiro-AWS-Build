/**
 * Quality Baseline types for the Reference Ingestion system.
 *
 * These types define the structure of quality baselines generated from
 * reference analysis reports. Baselines contain scored dimensions (1-10),
 * confidence scores, and metadata for tracking provenance.
 */

// ---------------------------------------------------------------------------
// Scored Dimension
// ---------------------------------------------------------------------------

/** A single scored dimension within a quality baseline */
export interface ScoredDimension {
  /** Dimension name (measurable, evaluatable) */
  name: string;
  /** Score threshold (1-10) */
  score: number;
  /** Number of references contributing to this dimension's score */
  referenceCount: number;
  /** Confidence score (0-1) based on data completeness and reference count */
  confidence: number;
  /** Example patterns illustrating this dimension */
  examplePatterns: string[];
}

// ---------------------------------------------------------------------------
// Reference Source
// ---------------------------------------------------------------------------

/** Metadata about a reference source contributing to the baseline */
export interface ReferenceSource {
  /** Source URL of the reference */
  url: string;
  /** Date the reference was analyzed */
  extractionDate: Date;
  /** Weight applied to this reference (based on performance metrics) */
  weight: number;
}

// ---------------------------------------------------------------------------
// Contradiction
// ---------------------------------------------------------------------------

/** A flagged contradiction between references */
export interface BaselineContradiction {
  /** The dimension where the contradiction occurs */
  dimension: string;
  /** The existing pattern in the baseline */
  existingPattern: string;
  /** The conflicting pattern from the new reference */
  conflictingPattern: string;
  /** Source URL of the conflicting reference */
  sourceUrl: string;
  /** Date the contradiction was detected */
  detectedAt: Date;
  /** Resolution status */
  resolved: boolean;
}

// ---------------------------------------------------------------------------
// Core Principle
// ---------------------------------------------------------------------------

/** A pattern elevated to core principle status (appears across multiple references) */
export interface CorePrinciple {
  /** The pattern description */
  pattern: string;
  /** Number of references where this pattern appears */
  occurrenceCount: number;
  /** Total references analyzed */
  totalReferences: number;
  /** Confidence score (occurrenceCount / totalReferences) */
  confidence: number;
  /** Dimension this principle relates to */
  dimension: string;
}

// ---------------------------------------------------------------------------
// Base Quality Baseline
// ---------------------------------------------------------------------------

/** Common fields for all quality baselines */
export interface QualityBaseline {
  /** Unique identifier for this baseline version */
  id: string;
  /** Type discriminator */
  type: 'app' | 'video';
  /** Domain category (e.g., "wellness apps", "tech review channels") */
  domainCategory: string;
  /** All scored dimensions */
  dimensions: ScoredDimension[];
  /** Sources contributing to this baseline */
  sources: ReferenceSource[];
  /** Core principles elevated from cross-reference patterns */
  corePrinciples: CorePrinciple[];
  /** Flagged contradictions between references */
  contradictions: BaselineContradiction[];
  /** Overall confidence score (0-1) */
  overallConfidence: number;
  /** Version number (increments on each merge) */
  version: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// App Quality Baseline
// ---------------------------------------------------------------------------

/** App-specific dimension names */
export type AppDimensionName =
  | 'visual_polish'
  | 'interaction_complexity'
  | 'content_depth'
  | 'monetization_sophistication'
  | 'retention_mechanic_strength'
  | 'onboarding_effectiveness';

/** Quality baseline for app references */
export interface AppQualityBaseline extends QualityBaseline {
  type: 'app';
}

// ---------------------------------------------------------------------------
// Video Quality Baseline
// ---------------------------------------------------------------------------

/** Video-specific dimension names */
export type VideoDimensionName =
  | 'hook_strength'
  | 'pacing_quality'
  | 'thumbnail_effectiveness'
  | 'title_optimization'
  | 'production_value'
  | 'engagement_trigger_density';

/** Quality baseline for video/channel references */
export interface VideoQualityBaseline extends QualityBaseline {
  type: 'video';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All app baseline dimension names */
export const APP_DIMENSIONS: AppDimensionName[] = [
  'visual_polish',
  'interaction_complexity',
  'content_depth',
  'monetization_sophistication',
  'retention_mechanic_strength',
  'onboarding_effectiveness',
];

/** All video baseline dimension names */
export const VIDEO_DIMENSIONS: VideoDimensionName[] = [
  'hook_strength',
  'pacing_quality',
  'thumbnail_effectiveness',
  'title_optimization',
  'production_value',
  'engagement_trigger_density',
];

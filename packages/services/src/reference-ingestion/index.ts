/**
 * Reference Ingestion service module.
 */
export { ReferenceIngestionServiceImpl, ReferenceIngestionError } from './service.js';
export type { ReferenceIngestionServiceConfig } from './service.js';
export type {
  ReferenceIngestionService,
  ReferenceType,
  UrlClassification,
  IngestionResult,
  IngestionError,
  AppStoreAnalyzer,
  YouTubeChannelAnalyzer,
  AppReferenceReport,
  ChannelReferenceReport,
  ReferenceReport,
  BaseReferenceReport,
} from './types.js';

export { AppStoreAnalyzerImpl, AppStoreAnalysisError } from './analyzers/app-store-analyzer.js';
export { YouTubeChannelAnalyzerImpl, YouTubeChannelAnalysisError } from './analyzers/youtube-channel-analyzer.js';

export { QualityBaselineGenerator } from './baseline/quality-baseline-generator.js';
export { BaselineStorage } from './baseline/baseline-storage.js';
export type { StoredBaselineVersion } from './baseline/baseline-storage.js';
export type {
  QualityBaseline,
  AppQualityBaseline,
  VideoQualityBaseline,
  ScoredDimension,
  ReferenceSource,
  CorePrinciple,
  BaselineContradiction,
  AppDimensionName,
  VideoDimensionName,
} from './baseline/types.js';
export { APP_DIMENSIONS, VIDEO_DIMENSIONS } from './baseline/types.js';

export { ReferenceQualityGate } from './gate/reference-quality-gate.js';
export type {
  ProductionOutput,
  DimensionScore,
  RejectionReport,
  GateEvaluationResult,
} from './gate/reference-quality-gate.js';

export { AutoReworkLoop } from './rework/auto-rework-loop.js';
export type {
  ReworkDirective,
  ReworkResult,
  TrainingCascade,
  ScoreProgressionEntry,
  ReworkTracker,
  EscalationRecommendation,
  EscalationRequest,
  EscalationCallback,
} from './rework/auto-rework-loop.js';

export { PreProductionPlanService } from './plan/pre-production-plan.js';
export type {
  ProductionPlan,
  DimensionApproach,
  ApprovalResult,
  ApprovalCallback,
  PlanRevisionResult,
  PlanApprovalFlowResult,
} from './plan/pre-production-plan.js';

export { BaselineEffectivenessTracker } from './learning/baseline-effectiveness-tracker.js';
export type {
  EvaluationRecord,
  BaselineUpdateRecord,
  PassRateWindow,
  BaselineCorrelation,
  EffectivenessReport,
} from './learning/baseline-effectiveness-tracker.js';

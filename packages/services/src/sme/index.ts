/**
 * SME (Subject Matter Expert) module — Domain Expertise Profile management
 * and Heartbeat Scheduler for proactive domain research.
 *
 * Provides storage, retrieval, and management of domain expertise profiles
 * for each sub-agent in the SeraphimOS hierarchy, plus scheduled heartbeat
 * reviews that benchmark against world-class performance.
 */

export {
  DomainExpertiseProfileService,
  type DomainExpertiseProfile,
  type DomainExpertiseProfileServiceConfig,
  type KnowledgeEntry,
  type CompetitiveIntel,
  type MetricValue,
  type DecisionFramework,
  type DecisionNode,
  type QualityBenchmark,
  type BestPractice,
  type LearnedPattern,
  type ResearchTopic,
  type ConflictEntry,
  type SeedProfileInput,
  type ProfileUpdateInput,
} from './domain-expertise-profile.js';

export {
  HeartbeatScheduler,
  DEFAULT_HEARTBEAT_CONFIGS,
  type HeartbeatConfig,
  type HeartbeatReviewResult,
  type HeartbeatSchedulerConfig,
  type DomainAssessment,
  type Benchmark,
  type GapAnalysisEntry,
  type Recommendation,
  type ActionStep,
  type ResearchSource,
  type ResearchDepth,
  type ResearchFindings,
  type DomainResearchDriver,
  type RecommendationQueue,
} from './heartbeat-scheduler.js';

export {
  RecommendationEngineImpl,
  type RecommendationEngine,
  type RecommendationEngineConfig,
  type ExecutionTask,
  type ImpactMeasurement,
  type CalibrationReport,
  type DomainSummary,
  type RecommendationSummary,
} from './recommendation-engine.js';

export {
  IndustryScannerImpl,
  DEFAULT_SCAN_SOURCES,
  type IndustryScanner,
  type IndustryScannerConfig,
  type TechnologyDiscovery,
  type TechnologyAssessment,
  type TechnologyRoadmap,
  type TechnologyCategory,
  type AdoptionComplexity,
  type RecommendedTimeline,
  type ScanResult,
  type AssessmentFilter,
  type LLMProvider,
  type SourceFetcher,
} from './industry-scanner.js';

export {
  SelfImprovementEngineImpl,
  type SelfImprovementEngine,
  type SelfImprovementEngineConfig,
  type SelfAssessmentResult,
  type CapabilityMaturityScore,
  type CapabilityGap,
  type SelfImprovementProposal,
  type SelfImprovementMetrics,
  type ProposalStatus,
  type MaturityTrend,
  type ProposalStep,
  type VerificationCriterion,
  type RollbackStep,
  type ImplementationResult,
  type VerificationResult,
  type RollbackResult,
  type SystemMetricsCollector,
  type AgentMetricsCollector,
} from './self-improvement-engine.js';

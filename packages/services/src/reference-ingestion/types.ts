/**
 * Reference Ingestion Service types.
 */

// ---------------------------------------------------------------------------
// Reference Types
// ---------------------------------------------------------------------------

/** Supported reference URL types */
export type ReferenceType = 'app-store-ios' | 'app-store-android' | 'youtube-channel';

/** Result of URL classification */
export interface UrlClassification {
  type: ReferenceType;
  url: string;
}

// ---------------------------------------------------------------------------
// Analyzer Interfaces
// ---------------------------------------------------------------------------

/** Base report structure for all analyzers */
export interface BaseReferenceReport {
  url: string;
  type: ReferenceType;
  analyzedAt: Date;
}

/** App Store analysis report */
export interface AppReferenceReport extends BaseReferenceReport {
  type: 'app-store-ios' | 'app-store-android';
  platform: 'ios' | 'android';
  listing: {
    appName: string;
    developer: string;
    category: string;
    rating: number;
    reviewCount: number;
    pricingModel: string;
    iapOptions: string[];
    description: string;
    featureList: string[];
  };
  visualAnalysis: {
    screenCount: number;
    layoutPatterns: string[];
    colorUsage: string[];
    typography: string[];
    navigationStructure: string;
    informationDensity: string;
  };
  reviewInsights: {
    topPraisedFeatures: string[];
    commonComplaints: string[];
    sentimentDistribution: { positive: number; neutral: number; negative: number };
    featureRequests: string[];
  };
  inferredPatterns: {
    onboardingComplexity: string;
    monetizationModel: string;
    notificationStrategy: string;
    interactionPatterns: string[];
    retentionMechanics: string[];
  };
}

/** YouTube Channel analysis report */
export interface ChannelReferenceReport extends BaseReferenceReport {
  type: 'youtube-channel';
  channelMetrics: {
    subscriberCount: number;
    totalVideos: number;
    uploadFrequency: number;
    avgViewsPerVideo: number;
    engagementRate: number;
    growthTrajectory: string;
  };
  videoBreakdowns: Array<{
    title: string;
    url: string;
    duration: number;
    views: number;
    hookStructure: string;
    editingPace: number;
    thumbnailComposition: string[];
  }>;
  productionFormula: {
    commonHookPatterns: string[];
    optimalLengthRange: { min: number; max: number };
    thumbnailRules: string[];
    titlePatterns: string[];
    pacingRhythm: string;
    engagementTriggers: string[];
  };
}

export type ReferenceReport = AppReferenceReport | ChannelReferenceReport;

// ---------------------------------------------------------------------------
// Analyzer Interfaces (to be implemented in subsequent tasks)
// ---------------------------------------------------------------------------

/** Interface for App Store analysis */
export interface AppStoreAnalyzer {
  analyze(url: string, platform: 'ios' | 'android'): Promise<AppReferenceReport>;
}

/** Interface for YouTube Channel analysis */
export interface YouTubeChannelAnalyzer {
  analyze(url: string): Promise<ChannelReferenceReport>;
}

// ---------------------------------------------------------------------------
// Ingestion Result
// ---------------------------------------------------------------------------

export interface IngestionResult {
  success: boolean;
  referenceType: ReferenceType;
  url: string;
  report?: ReferenceReport;
  error?: string;
}

// ---------------------------------------------------------------------------
// Ingestion Error
// ---------------------------------------------------------------------------

export interface IngestionError {
  code: 'UNSUPPORTED_URL' | 'TOKEN_DENIED' | 'ANALYSIS_FAILED' | 'INVALID_URL';
  message: string;
  supportedFormats?: string[];
}

// ---------------------------------------------------------------------------
// Reference Ingestion Service Interface
// ---------------------------------------------------------------------------

export interface ReferenceIngestionService {
  ingest(url: string): Promise<IngestionResult>;
}

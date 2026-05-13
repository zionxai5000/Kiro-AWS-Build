/**
 * ZionX App Development Studio — Testing Panel Service
 *
 * Manages test execution, gate checks, store readiness validation, and design
 * quality scoring. Critical gate checks block progression to Build/Submit phase.
 * Non-critical checks produce warnings but allow progression.
 *
 * Requirements: 42f.16, 42f.17, 42f.18
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TestCategory = 'unit' | 'ui' | 'accessibility' | 'design-quality' | 'store-readiness';

export interface TestCheckResult {
  id: string;
  category: TestCategory;
  name: string;
  passed: boolean;
  score?: number;
  details?: string;
  error?: string;
  duration?: number;
}

export interface GateCheck {
  id: string;
  name: string;
  category: TestCategory;
  critical: boolean;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  result?: TestCheckResult;
}

export interface StoreReadinessItem {
  id: string;
  name: string;
  required: boolean;
  status: 'complete' | 'incomplete' | 'not-applicable';
  details?: string;
}

export interface DesignQualityScore {
  overall: number;
  visualPolish: number;
  interactionDesign: number;
  informationArchitecture: number;
  onboardingEffectiveness: number;
  baselineComparison?: string;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface TestingPanelService {
  runAllTests(sessionId: string): Promise<TestCheckResult[]>;
  runCategory(sessionId: string, category: TestCategory): Promise<TestCheckResult[]>;
  getGateChecks(sessionId: string): Promise<GateCheck[]>;
  canProgress(sessionId: string): Promise<{ allowed: boolean; blockers: GateCheck[] }>;
  getStoreReadiness(sessionId: string): Promise<StoreReadinessItem[]>;
  getDesignQualityScore(sessionId: string): Promise<DesignQualityScore>;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (for injection / mocking)
// ---------------------------------------------------------------------------

export interface TestExecutor {
  runUnitTests(sessionId: string): Promise<TestCheckResult[]>;
  runUITests(sessionId: string): Promise<TestCheckResult[]>;
  runAccessibilityChecks(sessionId: string): Promise<TestCheckResult[]>;
}

export interface DesignQualityAnalyzer {
  analyze(sessionId: string, baseline: string): Promise<DesignQualityScore>;
}

export interface StoreMetadataProvider {
  getMetadata(sessionId: string): Promise<{
    appName?: string;
    appDescription?: string;
    category?: string;
    keywords?: string[];
    privacyPolicyUrl?: string;
    screenshots?: Record<string, string[]>;
    appIcon?: string;
    featureGraphic?: string;
    eulaUrl?: string;
    hasIAP?: boolean;
    iapProducts?: string[];
    iapSandboxValidated?: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TestingPanelConfig {
  testExecutor: TestExecutor;
  designQualityAnalyzer: DesignQualityAnalyzer;
  storeMetadataProvider: StoreMetadataProvider;
  qualityBaseline?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUALITY_BASELINE = 'Quality_Baseline';
const DESIGN_QUALITY_WARNING_THRESHOLD = 70;

const REQUIRED_SCREENSHOT_SIZES = [
  'iphone-6.7',
  'iphone-6.5',
  'ipad',
  'google-play-phone',
  'google-play-tablet',
];

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultTestingPanelService implements TestingPanelService {
  private readonly testExecutor: TestExecutor;
  private readonly designQualityAnalyzer: DesignQualityAnalyzer;
  private readonly storeMetadataProvider: StoreMetadataProvider;
  private readonly qualityBaseline: string;

  constructor(config: TestingPanelConfig) {
    this.testExecutor = config.testExecutor;
    this.designQualityAnalyzer = config.designQualityAnalyzer;
    this.storeMetadataProvider = config.storeMetadataProvider;
    this.qualityBaseline = config.qualityBaseline ?? QUALITY_BASELINE;
  }

  async runAllTests(sessionId: string): Promise<TestCheckResult[]> {
    const [unitResults, uiResults, accessibilityResults] = await Promise.all([
      this.testExecutor.runUnitTests(sessionId),
      this.testExecutor.runUITests(sessionId),
      this.testExecutor.runAccessibilityChecks(sessionId),
    ]);

    return [...unitResults, ...uiResults, ...accessibilityResults];
  }

  async runCategory(sessionId: string, category: TestCategory): Promise<TestCheckResult[]> {
    switch (category) {
      case 'unit':
        return this.testExecutor.runUnitTests(sessionId);
      case 'ui':
        return this.testExecutor.runUITests(sessionId);
      case 'accessibility':
        return this.testExecutor.runAccessibilityChecks(sessionId);
      case 'design-quality':
        return this.runDesignQualityAsResults(sessionId);
      case 'store-readiness':
        return this.runStoreReadinessAsResults(sessionId);
    }
  }

  async getGateChecks(sessionId: string): Promise<GateCheck[]> {
    const [testResults, designScore, metadata] = await Promise.all([
      this.runAllTests(sessionId),
      this.designQualityAnalyzer.analyze(sessionId, this.qualityBaseline),
      this.storeMetadataProvider.getMetadata(sessionId),
    ]);

    const accessibilityPassed = testResults
      .filter((r) => r.category === 'accessibility')
      .every((r) => r.passed);

    const unitTestsPassed = testResults
      .filter((r) => r.category === 'unit')
      .every((r) => r.passed);

    const uiTestsPassed = testResults
      .filter((r) => r.category === 'ui')
      .every((r) => r.passed);

    const metadataComplete = Boolean(
      metadata.appName &&
      metadata.appDescription &&
      metadata.keywords &&
      metadata.keywords.length > 0 &&
      metadata.category,
    );

    const privacyPolicyPresent = Boolean(metadata.privacyPolicyUrl);

    const screenshotsGenerated = REQUIRED_SCREENSHOT_SIZES.every(
      (size) => metadata.screenshots && metadata.screenshots[size] && metadata.screenshots[size].length > 0,
    );

    const iapApplicable = Boolean(metadata.hasIAP);
    const iapSandboxValidated = !iapApplicable || Boolean(metadata.iapSandboxValidated);

    const gates: GateCheck[] = [
      {
        id: 'gate-accessibility',
        name: 'Accessibility Compliance',
        category: 'accessibility',
        critical: true,
        status: accessibilityPassed ? 'passed' : 'failed',
        result: {
          id: 'result-accessibility',
          category: 'accessibility',
          name: 'WCAG 2.1 AA Compliance',
          passed: accessibilityPassed,
          details: accessibilityPassed
            ? 'All accessibility checks passed'
            : 'One or more accessibility checks failed',
        },
      },
      {
        id: 'gate-store-metadata',
        name: 'Store Metadata Complete',
        category: 'store-readiness',
        critical: true,
        status: metadataComplete ? 'passed' : 'failed',
        result: {
          id: 'result-store-metadata',
          category: 'store-readiness',
          name: 'Store Metadata Complete',
          passed: metadataComplete,
          details: metadataComplete
            ? 'Title, description, keywords, and category are set'
            : 'Missing required store metadata fields',
        },
      },
      {
        id: 'gate-privacy-policy',
        name: 'Privacy Policy Present',
        category: 'store-readiness',
        critical: true,
        status: privacyPolicyPresent ? 'passed' : 'failed',
        result: {
          id: 'result-privacy-policy',
          category: 'store-readiness',
          name: 'Privacy Policy Present',
          passed: privacyPolicyPresent,
          details: privacyPolicyPresent
            ? 'Privacy policy URL is set'
            : 'Privacy policy URL is missing',
        },
      },
      {
        id: 'gate-screenshots',
        name: 'Screenshots Generated',
        category: 'store-readiness',
        critical: true,
        status: screenshotsGenerated ? 'passed' : 'failed',
        result: {
          id: 'result-screenshots',
          category: 'store-readiness',
          name: 'Screenshots Generated',
          passed: screenshotsGenerated,
          details: screenshotsGenerated
            ? 'Screenshots available for all required device sizes'
            : 'Missing screenshots for one or more required device sizes',
        },
      },
      {
        id: 'gate-iap-sandbox',
        name: 'IAP Sandbox Validated',
        category: 'store-readiness',
        critical: true,
        status: !iapApplicable ? 'skipped' : iapSandboxValidated ? 'passed' : 'failed',
        result: {
          id: 'result-iap-sandbox',
          category: 'store-readiness',
          name: 'IAP Sandbox Validated',
          passed: iapSandboxValidated,
          details: !iapApplicable
            ? 'No IAP configured — check skipped'
            : iapSandboxValidated
              ? 'IAP sandbox validation passed'
              : 'IAP sandbox validation failed',
        },
      },
      {
        id: 'gate-design-quality',
        name: 'Design Quality Score',
        category: 'design-quality',
        critical: false,
        status: designScore.overall >= DESIGN_QUALITY_WARNING_THRESHOLD ? 'passed' : 'failed',
        result: {
          id: 'result-design-quality',
          category: 'design-quality',
          name: 'Design Quality Score',
          passed: designScore.overall >= DESIGN_QUALITY_WARNING_THRESHOLD,
          score: designScore.overall,
          details: designScore.overall >= DESIGN_QUALITY_WARNING_THRESHOLD
            ? `Design quality score: ${designScore.overall}/100`
            : `Design quality score ${designScore.overall}/100 is below threshold of ${DESIGN_QUALITY_WARNING_THRESHOLD}`,
        },
      },
      {
        id: 'gate-unit-tests',
        name: 'Unit Tests Pass',
        category: 'unit',
        critical: false,
        status: unitTestsPassed ? 'passed' : 'failed',
        result: {
          id: 'result-unit-tests',
          category: 'unit',
          name: 'Unit Tests Pass',
          passed: unitTestsPassed,
          details: unitTestsPassed
            ? 'All unit tests passed'
            : 'One or more unit tests failed',
        },
      },
      {
        id: 'gate-ui-tests',
        name: 'UI Tests Pass',
        category: 'ui',
        critical: false,
        status: uiTestsPassed ? 'passed' : 'failed',
        result: {
          id: 'result-ui-tests',
          category: 'ui',
          name: 'UI Tests Pass',
          passed: uiTestsPassed,
          details: uiTestsPassed
            ? 'All UI tests passed'
            : 'One or more UI tests failed',
        },
      },
    ];

    return gates;
  }

  async canProgress(sessionId: string): Promise<{ allowed: boolean; blockers: GateCheck[] }> {
    const gates = await this.getGateChecks(sessionId);
    const blockers = gates.filter((g) => g.critical && g.status === 'failed');
    return {
      allowed: blockers.length === 0,
      blockers,
    };
  }

  async getStoreReadiness(sessionId: string): Promise<StoreReadinessItem[]> {
    const metadata = await this.storeMetadataProvider.getMetadata(sessionId);

    const items: StoreReadinessItem[] = [
      {
        id: 'readiness-app-name',
        name: 'App name set',
        required: true,
        status: metadata.appName ? 'complete' : 'incomplete',
      },
      {
        id: 'readiness-app-description',
        name: 'App description set',
        required: true,
        status: metadata.appDescription ? 'complete' : 'incomplete',
      },
      {
        id: 'readiness-category',
        name: 'Category selected',
        required: true,
        status: metadata.category ? 'complete' : 'incomplete',
      },
      {
        id: 'readiness-keywords',
        name: 'Keywords defined',
        required: true,
        status: metadata.keywords && metadata.keywords.length > 0 ? 'complete' : 'incomplete',
      },
      {
        id: 'readiness-privacy-policy',
        name: 'Privacy policy URL',
        required: true,
        status: metadata.privacyPolicyUrl ? 'complete' : 'incomplete',
      },
      {
        id: 'readiness-screenshots',
        name: 'Screenshots for all sizes',
        required: true,
        status: REQUIRED_SCREENSHOT_SIZES.every(
          (size) => metadata.screenshots && metadata.screenshots[size] && metadata.screenshots[size].length > 0,
        )
          ? 'complete'
          : 'incomplete',
      },
      {
        id: 'readiness-app-icon',
        name: 'App icon (1024×1024)',
        required: true,
        status: metadata.appIcon ? 'complete' : 'incomplete',
      },
      {
        id: 'readiness-feature-graphic',
        name: 'Feature graphic (Google Play)',
        required: false,
        status: metadata.featureGraphic ? 'complete' : 'incomplete',
      },
      {
        id: 'readiness-iap-products',
        name: 'IAP products configured',
        required: false,
        status: !metadata.hasIAP
          ? 'not-applicable'
          : metadata.iapProducts && metadata.iapProducts.length > 0
            ? 'complete'
            : 'incomplete',
        details: !metadata.hasIAP ? 'No IAP configured' : undefined,
      },
      {
        id: 'readiness-eula',
        name: 'EULA/Terms link',
        required: false,
        status: metadata.eulaUrl ? 'complete' : 'incomplete',
      },
    ];

    return items;
  }

  async getDesignQualityScore(sessionId: string): Promise<DesignQualityScore> {
    return this.designQualityAnalyzer.analyze(sessionId, this.qualityBaseline);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private async runDesignQualityAsResults(sessionId: string): Promise<TestCheckResult[]> {
    const score = await this.designQualityAnalyzer.analyze(sessionId, this.qualityBaseline);
    return [
      {
        id: 'design-quality-overall',
        category: 'design-quality',
        name: 'Design Quality Overall',
        passed: score.overall >= DESIGN_QUALITY_WARNING_THRESHOLD,
        score: score.overall,
        details: `Overall: ${score.overall}, Visual: ${score.visualPolish}, Interaction: ${score.interactionDesign}, IA: ${score.informationArchitecture}, Onboarding: ${score.onboardingEffectiveness}`,
      },
    ];
  }

  private async runStoreReadinessAsResults(sessionId: string): Promise<TestCheckResult[]> {
    const items = await this.getStoreReadiness(sessionId);
    return items.map((item) => ({
      id: `store-readiness-${item.id}`,
      category: 'store-readiness' as TestCategory,
      name: item.name,
      passed: item.status === 'complete' || item.status === 'not-applicable',
      details: item.details ?? `Status: ${item.status}`,
    }));
  }
}

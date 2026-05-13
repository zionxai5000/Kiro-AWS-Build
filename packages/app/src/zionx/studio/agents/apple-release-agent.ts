/**
 * ZionX App Development Studio — Apple Release Agent
 *
 * Owns the complete iOS release workflow: Xcode build, Bundle ID management,
 * App Store Connect metadata, Apple IAP/RevenueCat validation, privacy nutrition
 * label generation, device-specific screenshots, TestFlight distribution,
 * App Store review submission, and rejection remediation.
 *
 * Exposes MCP tools: apple.validateMetadata, apple.uploadScreenshots,
 * apple.submitForReview, apple.checkReviewStatus, apple.uploadBuild
 *
 * Requirements: 42g.20, 42k.34
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppleBuildConfig {
  bundleId: string;
  teamId: string;
  provisioningProfile: string;
  signingCertificate: string;
  targetSdkVersion: string;
  buildNumber: string;
  versionString: string;
}

export interface AppStoreMetadata {
  appName: string;
  subtitle: string;
  description: string;
  keywords: string[];
  category: string;
  subcategory?: string;
  privacyPolicyUrl: string;
  supportUrl: string;
  marketingUrl?: string;
  copyright: string;
  ageRating: string;
}

export interface PrivacyNutritionLabel {
  dataTypes: { type: string; purpose: string; linked: boolean }[];
  trackingEnabled: boolean;
  trackingDomains: string[];
}

export interface AppleRejection {
  guidelineNumber: string;
  guidelineTitle: string;
  description: string;
  remediationSteps: string[];
  severity: 'critical' | 'major' | 'minor';
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Driver Interfaces (injected dependencies)
// ---------------------------------------------------------------------------

export interface AppStoreConnectDriver {
  createApp(bundleId: string, name: string): Promise<{ appId: string }>;
  uploadBuild(appId: string, buildPath: string): Promise<{ buildId: string; status: string }>;
  submitForReview(appId: string, buildId: string): Promise<{ submissionId: string }>;
  checkReviewStatus(appId: string): Promise<{ status: string; rejectionReason?: string }>;
  updateMetadata(appId: string, metadata: AppStoreMetadata): Promise<void>;
  uploadScreenshots(
    appId: string,
    screenshots: { deviceType: string; path: string }[],
  ): Promise<void>;
  validateIAP(appId: string, products: string[]): Promise<{ valid: boolean; errors: string[] }>;
  uploadToTestFlight(appId: string, buildId: string, groups: string[]): Promise<void>;
}

export interface XcodeBuildSystem {
  triggerBuild(
    config: AppleBuildConfig,
  ): Promise<{
    buildId: string;
    status: 'queued' | 'building' | 'success' | 'failed';
    outputPath?: string;
  }>;
  getBuildStatus(
    buildId: string,
  ): Promise<{ status: string; progress?: number; error?: string }>;
  signBuild(
    buildPath: string,
    config: AppleBuildConfig,
  ): Promise<{ signed: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Apple HIG Screenshot Requirements
// ---------------------------------------------------------------------------

const APPLE_HIG_SCREENSHOT_REQUIREMENTS: Record<
  string,
  { width: number; height: number }
> = {
  'iphone-6.7': { width: 1290, height: 2796 },
  'iphone-6.5': { width: 1284, height: 2778 },
  'iphone-5.5': { width: 1242, height: 2208 },
  'ipad-12.9': { width: 2048, height: 2732 },
  'ipad-11': { width: 1668, height: 2388 },
};

// ---------------------------------------------------------------------------
// Rejection Guideline Patterns
// ---------------------------------------------------------------------------

const GUIDELINE_PATTERNS: {
  pattern: RegExp;
  number: string;
  title: string;
  severity: 'critical' | 'major' | 'minor';
}[] = [
  {
    pattern: /guideline\s*4\.3/i,
    number: '4.3',
    title: 'Spam',
    severity: 'critical',
  },
  {
    pattern: /guideline\s*2\.1/i,
    number: '2.1',
    title: 'App Completeness',
    severity: 'critical',
  },
  {
    pattern: /guideline\s*2\.3/i,
    number: '2.3',
    title: 'Accurate Metadata',
    severity: 'major',
  },
  {
    pattern: /guideline\s*5\.1\.1/i,
    number: '5.1.1',
    title: 'Data Collection and Storage',
    severity: 'critical',
  },
  {
    pattern: /guideline\s*5\.1\.2/i,
    number: '5.1.2',
    title: 'Data Use and Sharing',
    severity: 'critical',
  },
  {
    pattern: /guideline\s*3\.1\.1/i,
    number: '3.1.1',
    title: 'In-App Purchase',
    severity: 'critical',
  },
  {
    pattern: /guideline\s*3\.1\.2/i,
    number: '3.1.2',
    title: 'Subscriptions',
    severity: 'major',
  },
  {
    pattern: /guideline\s*4\.0/i,
    number: '4.0',
    title: 'Design',
    severity: 'minor',
  },
  {
    pattern: /guideline\s*1\.2/i,
    number: '1.2',
    title: 'User Generated Content',
    severity: 'major',
  },
  {
    pattern: /guideline\s*2\.5\.1/i,
    number: '2.5.1',
    title: 'Software Requirements',
    severity: 'major',
  },
];

// ---------------------------------------------------------------------------
// Remediation Templates
// ---------------------------------------------------------------------------

const REMEDIATION_TEMPLATES: Record<string, string[]> = {
  '4.3': [
    'Differentiate app functionality from existing apps in the store',
    'Add unique features or content that justify a separate listing',
    'Consolidate similar apps into a single app with configuration options',
  ],
  '2.1': [
    'Ensure all features are fully functional and not placeholder',
    'Remove any broken links or incomplete screens',
    'Verify all login flows work with test credentials',
    'Ensure demo mode is available for review if login is required',
  ],
  '2.3': [
    'Update app description to accurately reflect current functionality',
    'Ensure screenshots match the current app UI',
    'Remove references to features not yet implemented',
    'Update keywords to match actual app content',
  ],
  '5.1.1': [
    'Update privacy policy to disclose all data collection',
    'Implement data deletion mechanism for user data',
    'Add purpose strings for all permission requests',
    'Ensure privacy nutrition labels match actual data practices',
  ],
  '5.1.2': [
    'Disclose all third-party SDKs that collect user data',
    'Implement App Tracking Transparency for tracking',
    'Update privacy nutrition labels for data sharing',
    'Provide opt-out mechanism for data sharing',
  ],
  '3.1.1': [
    'Ensure all digital goods use In-App Purchase',
    'Remove external payment links for digital content',
    'Verify IAP product IDs are correctly configured',
    'Test purchase flow in sandbox environment',
  ],
  '3.1.2': [
    'Clearly communicate subscription terms before purchase',
    'Implement subscription management within the app',
    'Provide easy cancellation instructions',
    'Ensure free trial terms are clearly stated',
  ],
  '4.0': [
    'Follow Apple Human Interface Guidelines for UI elements',
    'Ensure app works correctly on all supported device sizes',
    'Remove any non-standard UI patterns that confuse users',
  ],
  '1.2': [
    'Implement content moderation for user-generated content',
    'Add reporting mechanism for offensive content',
    'Implement blocking functionality for abusive users',
    'Add content filtering before display',
  ],
  '2.5.1': [
    'Ensure app uses only public APIs',
    'Remove any deprecated API usage',
    'Update minimum deployment target if required',
  ],
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export interface AppleReleaseAgentConfig {
  appId: string;
  teamId: string;
}

export class DefaultAppleReleaseAgent {
  private buildStatuses: Map<string, { status: string; progress?: number; error?: string }> =
    new Map();
  private sessionBuilds: Map<string, { buildId: string; outputPath?: string }> = new Map();

  constructor(
    private readonly driver: AppStoreConnectDriver,
    private readonly buildSystem: XcodeBuildSystem,
    private readonly config: AppleReleaseAgentConfig,
  ) {}

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  async triggerBuild(
    sessionId: string,
    buildConfig: AppleBuildConfig,
  ): Promise<{ buildId: string; status: string }> {
    const result = await this.buildSystem.triggerBuild(buildConfig);
    this.buildStatuses.set(result.buildId, { status: result.status });
    this.sessionBuilds.set(sessionId, {
      buildId: result.buildId,
      outputPath: result.outputPath,
    });
    return { buildId: result.buildId, status: result.status };
  }

  async getBuildStatus(
    buildId: string,
  ): Promise<{ status: string; progress?: number; error?: string }> {
    const liveStatus = await this.buildSystem.getBuildStatus(buildId);
    this.buildStatuses.set(buildId, liveStatus);
    return liveStatus;
  }

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  prepareMetadata(
    _sessionId: string,
    appInfo: Record<string, unknown>,
  ): AppStoreMetadata {
    const metadata: AppStoreMetadata = {
      appName: String(appInfo.name || ''),
      subtitle: String(appInfo.subtitle || ''),
      description: String(appInfo.description || ''),
      keywords: Array.isArray(appInfo.keywords)
        ? appInfo.keywords.map(String)
        : [],
      category: String(appInfo.category || ''),
      subcategory: appInfo.subcategory ? String(appInfo.subcategory) : undefined,
      privacyPolicyUrl: String(appInfo.privacyPolicyUrl || ''),
      supportUrl: String(appInfo.supportUrl || ''),
      marketingUrl: appInfo.marketingUrl ? String(appInfo.marketingUrl) : undefined,
      copyright: String(appInfo.copyright || ''),
      ageRating: String(appInfo.ageRating || '4+'),
    };

    // Validate required fields
    if (!metadata.appName) {
      throw new Error('App name is required for App Store metadata');
    }
    if (!metadata.description) {
      throw new Error('Description is required for App Store metadata');
    }
    if (!metadata.privacyPolicyUrl) {
      throw new Error('Privacy policy URL is required for App Store metadata');
    }
    if (!metadata.supportUrl) {
      throw new Error('Support URL is required for App Store metadata');
    }

    // Validate constraints
    if (metadata.appName.length > 30) {
      throw new Error('App name must be 30 characters or fewer');
    }
    if (metadata.subtitle && metadata.subtitle.length > 30) {
      throw new Error('Subtitle must be 30 characters or fewer');
    }
    if (metadata.description.length > 4000) {
      throw new Error('Description must be 4000 characters or fewer');
    }
    if (metadata.keywords.length > 0) {
      const keywordsStr = metadata.keywords.join(',');
      if (keywordsStr.length > 100) {
        throw new Error('Keywords must be 100 characters or fewer when joined');
      }
    }

    return metadata;
  }

  // -------------------------------------------------------------------------
  // Privacy Nutrition Label
  // -------------------------------------------------------------------------

  generatePrivacyNutritionLabel(
    _sessionId: string,
    appAnalysis: Record<string, unknown>,
  ): PrivacyNutritionLabel {
    const dataTypes: { type: string; purpose: string; linked: boolean }[] = [];
    const trackingDomains: string[] = [];
    let trackingEnabled = false;

    // Analyze integrations for data collection
    const integrations = appAnalysis.integrations as
      | Array<{ type: string; name: string }>
      | undefined;
    if (integrations) {
      for (const integration of integrations) {
        if (integration.type === 'analytics') {
          dataTypes.push({
            type: 'Analytics',
            purpose: 'Analytics',
            linked: true,
          });
          trackingEnabled = true;
        }
        if (integration.type === 'advertising') {
          dataTypes.push({
            type: 'Advertising Data',
            purpose: 'Third-Party Advertising',
            linked: false,
          });
          trackingEnabled = true;
          trackingDomains.push(`${integration.name.toLowerCase()}.tracking.com`);
        }
        if (integration.type === 'crash-reporting') {
          dataTypes.push({
            type: 'Crash Data',
            purpose: 'App Functionality',
            linked: false,
          });
        }
      }
    }

    // Analyze authentication for user data
    const auth = appAnalysis.authentication as { type: string } | undefined;
    if (auth) {
      dataTypes.push({
        type: 'Email Address',
        purpose: 'App Functionality',
        linked: true,
      });
      if (auth.type === 'social') {
        dataTypes.push({
          type: 'Name',
          purpose: 'App Functionality',
          linked: true,
        });
      }
    }

    // Analyze monetization for purchase data
    const monetization = appAnalysis.monetization as { model: string } | undefined;
    if (monetization) {
      if (
        monetization.model === 'subscription' ||
        monetization.model === 'freemium'
      ) {
        dataTypes.push({
          type: 'Purchase History',
          purpose: 'App Functionality',
          linked: true,
        });
      }
    }

    // Analyze permissions
    const permissions = appAnalysis.permissions as string[] | undefined;
    if (permissions) {
      if (permissions.includes('location')) {
        dataTypes.push({
          type: 'Precise Location',
          purpose: 'App Functionality',
          linked: true,
        });
      }
      if (permissions.includes('contacts')) {
        dataTypes.push({
          type: 'Contacts',
          purpose: 'App Functionality',
          linked: true,
        });
      }
      if (permissions.includes('photos')) {
        dataTypes.push({
          type: 'Photos or Videos',
          purpose: 'App Functionality',
          linked: true,
        });
      }
    }

    return {
      dataTypes,
      trackingEnabled,
      trackingDomains,
    };
  }

  // -------------------------------------------------------------------------
  // IAP Validation
  // -------------------------------------------------------------------------

  async validateIAP(
    _sessionId: string,
    products: string[],
  ): Promise<{ valid: boolean; errors: string[] }> {
    if (!products || products.length === 0) {
      return { valid: false, errors: ['No IAP products configured'] };
    }

    // Validate product ID format
    const formatErrors: string[] = [];
    for (const product of products) {
      if (!product.match(/^[a-zA-Z0-9_.]+$/)) {
        formatErrors.push(
          `Invalid product ID format: "${product}" — must contain only alphanumeric, dots, and underscores`,
        );
      }
    }

    if (formatErrors.length > 0) {
      return { valid: false, errors: formatErrors };
    }

    // Validate against App Store Connect
    const result = await this.driver.validateIAP(this.config.appId, products);
    return result;
  }

  // -------------------------------------------------------------------------
  // Screenshot Validation
  // -------------------------------------------------------------------------

  validateScreenshots(
    _sessionId: string,
    screenshots: { deviceType: string; path: string }[],
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!screenshots || screenshots.length === 0) {
      return { valid: false, errors: ['No screenshots provided'] };
    }

    for (const screenshot of screenshots) {
      const requirement = APPLE_HIG_SCREENSHOT_REQUIREMENTS[screenshot.deviceType];
      if (!requirement) {
        errors.push(
          `Unknown device type: "${screenshot.deviceType}" — valid types: ${Object.keys(APPLE_HIG_SCREENSHOT_REQUIREMENTS).join(', ')}`,
        );
      }
      if (!screenshot.path || screenshot.path.trim() === '') {
        errors.push(`Screenshot for ${screenshot.deviceType} has empty path`);
      }
    }

    // Check for required device types
    const providedTypes = new Set(screenshots.map((s) => s.deviceType));
    if (!providedTypes.has('iphone-6.7') && !providedTypes.has('iphone-6.5')) {
      errors.push('At least one iPhone screenshot size (6.7" or 6.5") is required');
    }

    return { valid: errors.length === 0, errors };
  }

  // -------------------------------------------------------------------------
  // TestFlight
  // -------------------------------------------------------------------------

  async uploadToTestFlight(
    sessionId: string,
    buildId: string,
    groups?: string[],
  ): Promise<void> {
    const targetGroups = groups || ['Internal Testers'];
    await this.driver.uploadToTestFlight(this.config.appId, buildId, targetGroups);
  }

  // -------------------------------------------------------------------------
  // Submission
  // -------------------------------------------------------------------------

  async submitForReview(
    sessionId: string,
  ): Promise<{ submissionId: string }> {
    const sessionBuild = this.sessionBuilds.get(sessionId);
    if (!sessionBuild) {
      throw new Error(`No build found for session: ${sessionId}`);
    }
    return this.driver.submitForReview(this.config.appId, sessionBuild.buildId);
  }

  async checkReviewStatus(
    _sessionId: string,
  ): Promise<{ status: string; rejection?: AppleRejection }> {
    const result = await this.driver.checkReviewStatus(this.config.appId);

    if (result.status === 'rejected' && result.rejectionReason) {
      const rejection = this.parseRejection(result.rejectionReason);
      return { status: result.status, rejection };
    }

    return { status: result.status };
  }

  // -------------------------------------------------------------------------
  // Rejection Handling
  // -------------------------------------------------------------------------

  parseRejection(rejectionText: string): AppleRejection {
    let guidelineNumber = 'unknown';
    let guidelineTitle = 'Unknown Guideline';
    let severity: 'critical' | 'major' | 'minor' = 'major';

    for (const pattern of GUIDELINE_PATTERNS) {
      if (pattern.pattern.test(rejectionText)) {
        guidelineNumber = pattern.number;
        guidelineTitle = pattern.title;
        severity = pattern.severity;
        break;
      }
    }

    const remediationSteps = this.generateRemediationPlan({
      guidelineNumber,
      guidelineTitle,
      description: rejectionText,
      remediationSteps: [],
      severity,
    });

    return {
      guidelineNumber,
      guidelineTitle,
      description: rejectionText,
      remediationSteps,
      severity,
    };
  }

  generateRemediationPlan(rejection: AppleRejection): string[] {
    const template = REMEDIATION_TEMPLATES[rejection.guidelineNumber];
    if (template) {
      return [...template];
    }

    // Generic remediation steps for unknown guidelines
    return [
      `Review Apple Guideline ${rejection.guidelineNumber}: ${rejection.guidelineTitle}`,
      'Address the specific issue described in the rejection notice',
      'Test the fix thoroughly before resubmitting',
      'Consider adding a note to the reviewer explaining the changes',
    ];
  }

  // -------------------------------------------------------------------------
  // MCP Tools
  // -------------------------------------------------------------------------

  getMCPTools(): MCPTool[] {
    return [
      {
        name: 'apple.validateMetadata',
        description:
          'Validates App Store metadata against Apple requirements including character limits, required fields, and content guidelines',
        inputSchema: {
          type: 'object',
          properties: {
            appName: { type: 'string', description: 'App name (max 30 chars)' },
            subtitle: { type: 'string', description: 'App subtitle (max 30 chars)' },
            description: { type: 'string', description: 'App description (max 4000 chars)' },
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: 'Search keywords (max 100 chars total)',
            },
            category: { type: 'string', description: 'Primary category' },
            privacyPolicyUrl: { type: 'string', description: 'Privacy policy URL' },
            supportUrl: { type: 'string', description: 'Support URL' },
            copyright: { type: 'string', description: 'Copyright notice' },
            ageRating: { type: 'string', description: 'Age rating (4+, 9+, 12+, 17+)' },
          },
          required: ['appName', 'description', 'privacyPolicyUrl', 'supportUrl', 'category'],
        },
      },
      {
        name: 'apple.uploadScreenshots',
        description:
          'Uploads screenshots to App Store Connect, validating dimensions against Apple HIG requirements for each device type',
        inputSchema: {
          type: 'object',
          properties: {
            screenshots: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  deviceType: {
                    type: 'string',
                    enum: Object.keys(APPLE_HIG_SCREENSHOT_REQUIREMENTS),
                  },
                  path: { type: 'string', description: 'Path to screenshot file' },
                },
                required: ['deviceType', 'path'],
              },
              description: 'Array of screenshots with device type and file path',
            },
          },
          required: ['screenshots'],
        },
      },
      {
        name: 'apple.submitForReview',
        description:
          'Submits the current build for App Store review. Requires a successful build and complete metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Studio session ID' },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'apple.checkReviewStatus',
        description:
          'Checks the current App Store review status. Returns status and rejection details if rejected.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Studio session ID' },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'apple.uploadBuild',
        description:
          'Triggers an Xcode build with the specified configuration and uploads the resulting IPA to App Store Connect',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Studio session ID' },
            bundleId: { type: 'string', description: 'iOS Bundle ID' },
            teamId: { type: 'string', description: 'Apple Developer Team ID' },
            provisioningProfile: {
              type: 'string',
              description: 'Provisioning profile name',
            },
            signingCertificate: {
              type: 'string',
              description: 'Code signing certificate name',
            },
            targetSdkVersion: { type: 'string', description: 'Target iOS SDK version' },
            buildNumber: { type: 'string', description: 'Build number' },
            versionString: { type: 'string', description: 'Version string (e.g., 1.0.0)' },
          },
          required: [
            'sessionId',
            'bundleId',
            'teamId',
            'provisioningProfile',
            'signingCertificate',
            'buildNumber',
            'versionString',
          ],
        },
      },
    ];
  }
}

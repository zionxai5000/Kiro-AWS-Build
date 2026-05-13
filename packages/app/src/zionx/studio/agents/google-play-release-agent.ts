/**
 * ZionX App Development Studio — Google Play Release Agent
 *
 * Owns the complete Android release workflow: Gradle AAB build, package name
 * management, signing keystore management, Google Play Console metadata,
 * Data Safety form generation, Google Play billing/RevenueCat validation,
 * closed testing track upload, production release promotion, and rejection
 * remediation.
 *
 * Exposes MCP tools: google.validateListing, google.uploadAssets,
 * google.submitForReview, google.checkReviewStatus, google.uploadAAB
 *
 * Requirements: 42g.21, 42k.35
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleBuildConfig {
  packageName: string;
  keystorePath: string;
  keystorePassword: string;
  keyAlias: string;
  keyPassword: string;
  targetSdkVersion: number;
  versionCode: number;
  versionName: string;
}

export interface PlayStoreMetadata {
  title: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  contactEmail: string;
  privacyPolicyUrl: string;
  defaultLanguage: string;
}

export interface DataSafetyForm {
  dataCollected: { type: string; purpose: string; optional: boolean }[];
  dataShared: { type: string; purpose: string; recipient: string }[];
  securityPractices: { encrypted: boolean; deletionMechanism: boolean };
}

export interface GoogleRejection {
  policyArea: string;
  policyTitle: string;
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

export interface GooglePlayConsoleDriver {
  createListing(packageName: string, title: string): Promise<{ appId: string }>;
  uploadAAB(appId: string, aabPath: string): Promise<{ versionCode: number; status: string }>;
  submitForReview(appId: string, track: string): Promise<{ releaseId: string }>;
  checkReviewStatus(appId: string): Promise<{ status: string; rejectionReason?: string }>;
  updateMetadata(appId: string, metadata: PlayStoreMetadata): Promise<void>;
  uploadAssets(
    appId: string,
    assets: { type: string; path: string }[],
  ): Promise<void>;
  validateBilling(
    appId: string,
    products: string[],
  ): Promise<{ valid: boolean; errors: string[] }>;
  promoteToProduction(appId: string, releaseId: string): Promise<void>;
  uploadToClosedTesting(
    appId: string,
    track: string,
    testers: string[],
  ): Promise<void>;
}

export interface GradleBuildSystem {
  triggerBuild(
    config: GoogleBuildConfig,
  ): Promise<{
    buildId: string;
    status: 'queued' | 'building' | 'success' | 'failed';
    outputPath?: string;
  }>;
  getBuildStatus(
    buildId: string,
  ): Promise<{ status: string; progress?: number; error?: string }>;
  signAAB(
    aabPath: string,
    config: GoogleBuildConfig,
  ): Promise<{ signed: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Google Play Screenshot Requirements
// ---------------------------------------------------------------------------

const GOOGLE_PLAY_SCREENSHOT_REQUIREMENTS: Record<
  string,
  { minWidth: number; minHeight: number }
> = {
  phone: { minWidth: 1080, minHeight: 1920 },
  'tablet-7': { minWidth: 1200, minHeight: 1920 },
  'tablet-10': { minWidth: 1600, minHeight: 2560 },
  'chromebook': { minWidth: 1920, minHeight: 1080 },
  'tv': { minWidth: 1920, minHeight: 1080 },
  'wear': { minWidth: 384, minHeight: 384 },
};

// ---------------------------------------------------------------------------
// Rejection Policy Patterns
// ---------------------------------------------------------------------------

const POLICY_PATTERNS: {
  pattern: RegExp;
  area: string;
  title: string;
  severity: 'critical' | 'major' | 'minor';
}[] = [
  {
    pattern: /deceptive\s*behavior/i,
    area: 'deceptive-behavior',
    title: 'Deceptive Behavior',
    severity: 'critical',
  },
  {
    pattern: /malware|unwanted\s*software/i,
    area: 'malware',
    title: 'Malware and Unwanted Software',
    severity: 'critical',
  },
  {
    pattern: /data\s*safety/i,
    area: 'data-safety',
    title: 'Data Safety Violations',
    severity: 'critical',
  },
  {
    pattern: /billing\s*policy/i,
    area: 'billing',
    title: 'Billing Policy Violations',
    severity: 'critical',
  },
  {
    pattern: /content\s*policy/i,
    area: 'content-policy',
    title: 'Content Policy Violations',
    severity: 'major',
  },
  {
    pattern: /permissions?\s*policy/i,
    area: 'permissions',
    title: 'Permissions Policy Violations',
    severity: 'major',
  },
  {
    pattern: /intellectual\s*property/i,
    area: 'ip',
    title: 'Intellectual Property',
    severity: 'critical',
  },
  {
    pattern: /impersonation/i,
    area: 'impersonation',
    title: 'Impersonation',
    severity: 'critical',
  },
  {
    pattern: /metadata\s*policy/i,
    area: 'metadata',
    title: 'Metadata Policy',
    severity: 'minor',
  },
  {
    pattern: /target\s*audience/i,
    area: 'target-audience',
    title: 'Target Audience and Content',
    severity: 'major',
  },
];

// ---------------------------------------------------------------------------
// Remediation Templates
// ---------------------------------------------------------------------------

const REMEDIATION_TEMPLATES: Record<string, string[]> = {
  'deceptive-behavior': [
    'Remove any misleading ads or deceptive UI patterns',
    'Ensure all permission requests have clear user-facing justification',
    'Remove any functionality that operates without user knowledge',
    'Verify ad placements do not mimic system notifications',
  ],
  malware: [
    'Remove any code that downloads or executes external code',
    'Ensure all network requests are to documented, legitimate endpoints',
    'Remove any obfuscated code that hides functionality',
    'Verify app does not access data outside its declared scope',
  ],
  'data-safety': [
    'Update Data Safety form to accurately reflect all data collection',
    'Ensure all data types collected are disclosed in the form',
    'Add data deletion mechanism if user data is stored',
    'Verify third-party SDK data collection is disclosed',
  ],
  billing: [
    'Ensure all digital goods use Google Play Billing',
    'Remove external payment links for in-app digital content',
    'Verify subscription products are correctly configured in Play Console',
    'Implement proper subscription lifecycle management',
  ],
  'content-policy': [
    'Remove any content that violates Google Play content policies',
    'Implement content moderation for user-generated content',
    'Add appropriate content ratings and warnings',
    'Ensure app content matches declared content rating',
  ],
  permissions: [
    'Remove any permissions not essential to core functionality',
    'Add runtime permission explanations before requesting access',
    'Ensure declared permissions match actual app usage',
    'Remove QUERY_ALL_PACKAGES unless absolutely necessary',
  ],
  ip: [
    'Remove any trademarked content used without authorization',
    'Ensure app name and icon do not infringe on existing brands',
    'Replace any copyrighted assets with original content',
    'Verify all third-party content is properly licensed',
  ],
  impersonation: [
    'Ensure app identity clearly distinguishes from other apps',
    'Update app name and icon to avoid confusion with established brands',
    'Remove any references that suggest official affiliation without authorization',
  ],
  metadata: [
    'Update store listing to accurately describe app functionality',
    'Remove any misleading claims from description',
    'Ensure screenshots reflect current app UI',
    'Remove keyword stuffing from title and description',
  ],
  'target-audience': [
    'Ensure content is appropriate for declared target audience',
    'Update target audience settings if app contains mature content',
    'Implement age-gating for restricted content',
    'Review Families Policy requirements if targeting children',
  ],
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export interface GooglePlayReleaseAgentConfig {
  appId: string;
  packageName: string;
}

export class DefaultGooglePlayReleaseAgent {
  private buildStatuses: Map<string, { status: string; progress?: number; error?: string }> =
    new Map();
  private sessionBuilds: Map<string, { buildId: string; outputPath?: string }> = new Map();

  constructor(
    private readonly driver: GooglePlayConsoleDriver,
    private readonly buildSystem: GradleBuildSystem,
    private readonly config: GooglePlayReleaseAgentConfig,
  ) {}

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  async triggerBuild(
    sessionId: string,
    buildConfig: GoogleBuildConfig,
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
  ): PlayStoreMetadata {
    const metadata: PlayStoreMetadata = {
      title: String(appInfo.title || ''),
      shortDescription: String(appInfo.shortDescription || ''),
      fullDescription: String(appInfo.fullDescription || ''),
      category: String(appInfo.category || ''),
      contactEmail: String(appInfo.contactEmail || ''),
      privacyPolicyUrl: String(appInfo.privacyPolicyUrl || ''),
      defaultLanguage: String(appInfo.defaultLanguage || 'en-US'),
    };

    // Validate required fields
    if (!metadata.title) {
      throw new Error('Title is required for Play Store metadata');
    }
    if (!metadata.shortDescription) {
      throw new Error('Short description is required for Play Store metadata');
    }
    if (!metadata.fullDescription) {
      throw new Error('Full description is required for Play Store metadata');
    }
    if (!metadata.contactEmail) {
      throw new Error('Contact email is required for Play Store metadata');
    }
    if (!metadata.privacyPolicyUrl) {
      throw new Error('Privacy policy URL is required for Play Store metadata');
    }

    // Validate constraints
    if (metadata.title.length > 30) {
      throw new Error('Title must be 30 characters or fewer');
    }
    if (metadata.shortDescription.length > 80) {
      throw new Error('Short description must be 80 characters or fewer');
    }
    if (metadata.fullDescription.length > 4000) {
      throw new Error('Full description must be 4000 characters or fewer');
    }

    return metadata;
  }

  // -------------------------------------------------------------------------
  // Data Safety Form
  // -------------------------------------------------------------------------

  generateDataSafetyForm(
    _sessionId: string,
    appAnalysis: Record<string, unknown>,
  ): DataSafetyForm {
    const dataCollected: { type: string; purpose: string; optional: boolean }[] = [];
    const dataShared: { type: string; purpose: string; recipient: string }[] = [];
    let encrypted = true;
    let deletionMechanism = false;

    // Analyze integrations for data collection
    const integrations = appAnalysis.integrations as
      | Array<{ type: string; name: string }>
      | undefined;
    if (integrations) {
      for (const integration of integrations) {
        if (integration.type === 'analytics') {
          dataCollected.push({
            type: 'App interactions',
            purpose: 'Analytics',
            optional: false,
          });
          dataShared.push({
            type: 'App interactions',
            purpose: 'Analytics',
            recipient: integration.name,
          });
        }
        if (integration.type === 'advertising') {
          dataCollected.push({
            type: 'Advertising ID',
            purpose: 'Advertising',
            optional: true,
          });
          dataShared.push({
            type: 'Advertising ID',
            purpose: 'Advertising',
            recipient: integration.name,
          });
        }
        if (integration.type === 'crash-reporting') {
          dataCollected.push({
            type: 'Crash logs',
            purpose: 'App functionality',
            optional: false,
          });
        }
      }
    }

    // Analyze authentication for user data
    const auth = appAnalysis.authentication as { type: string } | undefined;
    if (auth) {
      dataCollected.push({
        type: 'Email address',
        purpose: 'Account management',
        optional: false,
      });
      deletionMechanism = true;
      if (auth.type === 'social') {
        dataCollected.push({
          type: 'Name',
          purpose: 'Account management',
          optional: false,
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
        dataCollected.push({
          type: 'Purchase history',
          purpose: 'App functionality',
          optional: false,
        });
      }
    }

    // Analyze permissions
    const permissions = appAnalysis.permissions as string[] | undefined;
    if (permissions) {
      if (permissions.includes('location')) {
        dataCollected.push({
          type: 'Approximate location',
          purpose: 'App functionality',
          optional: true,
        });
      }
      if (permissions.includes('contacts')) {
        dataCollected.push({
          type: 'Contacts',
          purpose: 'App functionality',
          optional: true,
        });
      }
      if (permissions.includes('camera')) {
        dataCollected.push({
          type: 'Photos or videos',
          purpose: 'App functionality',
          optional: true,
        });
      }
    }

    return {
      dataCollected,
      dataShared,
      securityPractices: { encrypted, deletionMechanism },
    };
  }

  // -------------------------------------------------------------------------
  // Billing Validation
  // -------------------------------------------------------------------------

  async validateBilling(
    _sessionId: string,
    products: string[],
  ): Promise<{ valid: boolean; errors: string[] }> {
    if (!products || products.length === 0) {
      return { valid: false, errors: ['No billing products configured'] };
    }

    // Validate product ID format (Google Play format: lowercase, dots, underscores)
    const formatErrors: string[] = [];
    for (const product of products) {
      if (!product.match(/^[a-z][a-z0-9_.]*$/)) {
        formatErrors.push(
          `Invalid product ID format: "${product}" — must start with lowercase letter and contain only lowercase alphanumeric, dots, and underscores`,
        );
      }
    }

    if (formatErrors.length > 0) {
      return { valid: false, errors: formatErrors };
    }

    // Validate against Google Play Console
    const result = await this.driver.validateBilling(this.config.appId, products);
    return result;
  }

  // -------------------------------------------------------------------------
  // Closed Testing
  // -------------------------------------------------------------------------

  async uploadToClosedTesting(
    sessionId: string,
    buildId: string,
    track?: string,
    testers?: string[],
  ): Promise<void> {
    const targetTrack = track || 'internal';
    const targetTesters = testers || ['internal-testers@googlegroups.com'];
    await this.driver.uploadToClosedTesting(this.config.appId, targetTrack, targetTesters);
  }

  // -------------------------------------------------------------------------
  // Production Release Promotion
  // -------------------------------------------------------------------------

  async promoteToProduction(
    sessionId: string,
    releaseId: string,
  ): Promise<void> {
    await this.driver.promoteToProduction(this.config.appId, releaseId);
  }

  // -------------------------------------------------------------------------
  // Submission
  // -------------------------------------------------------------------------

  async submitForReview(
    sessionId: string,
    track?: string,
  ): Promise<{ releaseId: string }> {
    const sessionBuild = this.sessionBuilds.get(sessionId);
    if (!sessionBuild) {
      throw new Error(`No build found for session: ${sessionId}`);
    }
    const targetTrack = track || 'production';
    return this.driver.submitForReview(this.config.appId, targetTrack);
  }

  async checkReviewStatus(
    _sessionId: string,
  ): Promise<{ status: string; rejection?: GoogleRejection }> {
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

  parseRejection(rejectionText: string): GoogleRejection {
    let policyArea = 'unknown';
    let policyTitle = 'Unknown Policy';
    let severity: 'critical' | 'major' | 'minor' = 'major';

    for (const pattern of POLICY_PATTERNS) {
      if (pattern.pattern.test(rejectionText)) {
        policyArea = pattern.area;
        policyTitle = pattern.title;
        severity = pattern.severity;
        break;
      }
    }

    const remediationSteps = this.generateRemediationPlan({
      policyArea,
      policyTitle,
      description: rejectionText,
      remediationSteps: [],
      severity,
    });

    return {
      policyArea,
      policyTitle,
      description: rejectionText,
      remediationSteps,
      severity,
    };
  }

  generateRemediationPlan(rejection: GoogleRejection): string[] {
    const template = REMEDIATION_TEMPLATES[rejection.policyArea];
    if (template) {
      return [...template];
    }

    // Generic remediation steps for unknown policy areas
    return [
      `Review Google Play policy area: ${rejection.policyTitle}`,
      'Address the specific issue described in the rejection notice',
      'Test the fix thoroughly before resubmitting',
      'Consider filing an appeal if the rejection seems incorrect',
    ];
  }

  // -------------------------------------------------------------------------
  // MCP Tools
  // -------------------------------------------------------------------------

  getMCPTools(): MCPTool[] {
    return [
      {
        name: 'google.validateListing',
        description:
          'Validates Play Store listing metadata against Google Play requirements including character limits, required fields, and content guidelines',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'App title (max 30 chars)' },
            shortDescription: {
              type: 'string',
              description: 'Short description (max 80 chars)',
            },
            fullDescription: {
              type: 'string',
              description: 'Full description (max 4000 chars)',
            },
            category: { type: 'string', description: 'App category' },
            contactEmail: { type: 'string', description: 'Developer contact email' },
            privacyPolicyUrl: { type: 'string', description: 'Privacy policy URL' },
            defaultLanguage: {
              type: 'string',
              description: 'Default language code (e.g., en-US)',
            },
          },
          required: [
            'title',
            'shortDescription',
            'fullDescription',
            'contactEmail',
            'privacyPolicyUrl',
          ],
        },
      },
      {
        name: 'google.uploadAssets',
        description:
          'Uploads screenshots and feature graphic to Google Play Console, validating dimensions against Play Store requirements',
        inputSchema: {
          type: 'object',
          properties: {
            assets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: Object.keys(GOOGLE_PLAY_SCREENSHOT_REQUIREMENTS),
                    description: 'Asset type (phone, tablet-7, tablet-10, etc.)',
                  },
                  path: { type: 'string', description: 'Path to asset file' },
                },
                required: ['type', 'path'],
              },
              description: 'Array of assets with type and file path',
            },
          },
          required: ['assets'],
        },
      },
      {
        name: 'google.submitForReview',
        description:
          'Submits the current build to a Google Play track (production or testing). Requires a successful build and complete metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Studio session ID' },
            track: {
              type: 'string',
              enum: ['production', 'internal', 'alpha', 'beta'],
              description: 'Release track (defaults to production)',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'google.checkReviewStatus',
        description:
          'Checks the current Google Play review/release status. Returns status and rejection details if rejected.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Studio session ID' },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'google.uploadAAB',
        description:
          'Triggers a Gradle AAB build with the specified configuration and uploads the resulting bundle to Google Play Console',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Studio session ID' },
            packageName: { type: 'string', description: 'Android package name' },
            keystorePath: { type: 'string', description: 'Path to signing keystore' },
            keystorePassword: { type: 'string', description: 'Keystore password' },
            keyAlias: { type: 'string', description: 'Key alias in keystore' },
            keyPassword: { type: 'string', description: 'Key password' },
            targetSdkVersion: {
              type: 'number',
              description: 'Target Android SDK version',
            },
            versionCode: { type: 'number', description: 'Version code (integer)' },
            versionName: {
              type: 'string',
              description: 'Version name (e.g., 1.0.0)',
            },
          },
          required: [
            'sessionId',
            'packageName',
            'keystorePath',
            'keystorePassword',
            'keyAlias',
            'keyPassword',
            'versionCode',
            'versionName',
          ],
        },
      },
    ];
  }
}

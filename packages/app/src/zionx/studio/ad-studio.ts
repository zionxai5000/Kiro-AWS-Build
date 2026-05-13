/**
 * ZionX App Development Studio — Ad Studio Service
 *
 * Generates video ad creatives (15s vertical, 30s horizontal, 6s bumper, playable demos)
 * from app preview recordings, validates against ad network specifications (AdMob, AppLovin,
 * Unity Ads), and exports in network-ready formats without manual conversion.
 *
 * Requirements: 42i.28, 42i.29, 42i.30
 */

// ---------------------------------------------------------------------------
// Ad Creative Types
// ---------------------------------------------------------------------------

export type AdFormat = 'vertical-15s' | 'horizontal-30s' | 'bumper-6s' | 'playable';
export type AdNetwork = 'admob' | 'applovin' | 'unity-ads';

export interface AdCreative {
  id: string;
  sessionId: string;
  format: AdFormat;
  width: number;
  height: number;
  durationSeconds: number;
  filePath: string;
  fileSize: number;
  mimeType: string;
  hasInteractiveElements: boolean;
  validationStatus: 'pending' | 'valid' | 'invalid';
  validationErrors?: string[];
  networkCompatibility: AdNetwork[];
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Ad Network Specifications
// ---------------------------------------------------------------------------

export interface AdNetworkSpec {
  network: AdNetwork;
  maxFileSizeMB: number;
  allowedFormats: AdFormat[];
  maxDurationSeconds: Record<AdFormat, number>;
  aspectRatios: Record<AdFormat, { width: number; height: number }>;
  requiresInteractive: boolean;
  fileTypes: string[];
}

export const ADMOB_SPEC: AdNetworkSpec = {
  network: 'admob',
  maxFileSizeMB: 150,
  allowedFormats: ['vertical-15s', 'horizontal-30s', 'bumper-6s', 'playable'],
  maxDurationSeconds: {
    'vertical-15s': 15,
    'horizontal-30s': 30,
    'bumper-6s': 6,
    'playable': 60,
  },
  aspectRatios: {
    'vertical-15s': { width: 1080, height: 1920 },
    'horizontal-30s': { width: 1920, height: 1080 },
    'bumper-6s': { width: 1920, height: 1080 },
    'playable': { width: 1080, height: 1920 },
  },
  requiresInteractive: true,
  fileTypes: ['mp4', 'html'],
};

export const APPLOVIN_SPEC: AdNetworkSpec = {
  network: 'applovin',
  maxFileSizeMB: 100,
  allowedFormats: ['vertical-15s', 'horizontal-30s', 'bumper-6s', 'playable'],
  maxDurationSeconds: {
    'vertical-15s': 15,
    'horizontal-30s': 30,
    'bumper-6s': 6,
    'playable': 60,
  },
  aspectRatios: {
    'vertical-15s': { width: 1080, height: 1920 },
    'horizontal-30s': { width: 1920, height: 1080 },
    'bumper-6s': { width: 1920, height: 1080 },
    'playable': { width: 1080, height: 1920 },
  },
  requiresInteractive: true,
  fileTypes: ['mp4', 'html'],
};

export const UNITY_ADS_SPEC: AdNetworkSpec = {
  network: 'unity-ads',
  maxFileSizeMB: 100,
  allowedFormats: ['vertical-15s', 'horizontal-30s', 'bumper-6s', 'playable'],
  maxDurationSeconds: {
    'vertical-15s': 15,
    'horizontal-30s': 30,
    'bumper-6s': 6,
    'playable': 60,
  },
  aspectRatios: {
    'vertical-15s': { width: 1080, height: 1920 },
    'horizontal-30s': { width: 1920, height: 1080 },
    'bumper-6s': { width: 1920, height: 1080 },
    'playable': { width: 1080, height: 1920 },
  },
  requiresInteractive: true,
  fileTypes: ['mp4', 'html', 'mraid'],
};

export const AD_NETWORK_SPECS: AdNetworkSpec[] = [ADMOB_SPEC, APPLOVIN_SPEC, UNITY_ADS_SPEC];

// ---------------------------------------------------------------------------
// Video Generator Interface (injected dependency)
// ---------------------------------------------------------------------------

export interface VideoGenerator {
  generateVerticalAd(
    sessionId: string,
    durationSeconds: number,
  ): Promise<{ buffer: Buffer; fileSize: number }>;
  generateHorizontalAd(
    sessionId: string,
    durationSeconds: number,
  ): Promise<{ buffer: Buffer; fileSize: number }>;
  generateBumperAd(sessionId: string): Promise<{ buffer: Buffer; fileSize: number }>;
  generatePlayableAd(
    sessionId: string,
  ): Promise<{ buffer: Buffer; fileSize: number; hasInteractive: boolean }>;
}

// ---------------------------------------------------------------------------
// Ad Studio Service Interface
// ---------------------------------------------------------------------------

export interface AdStudioService {
  generateVerticalAd(sessionId: string): Promise<AdCreative>;
  generateHorizontalAd(sessionId: string): Promise<AdCreative>;
  generateBumperAd(sessionId: string): Promise<AdCreative>;
  generatePlayableAd(sessionId: string): Promise<AdCreative>;

  validateCreative(
    creativeId: string,
    network: AdNetwork,
  ): Promise<{ valid: boolean; errors: string[] }>;
  validateAllCreatives(
    sessionId: string,
  ): Promise<{ valid: boolean; errors: { creativeId: string; network: AdNetwork; errors: string[] }[] }>;

  exportForNetwork(
    creativeId: string,
    network: AdNetwork,
  ): Promise<{ filePath: string; format: string; ready: boolean }>;

  getCreatives(sessionId: string): Promise<AdCreative[]>;
  getNetworkSpecs(): AdNetworkSpec[];
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultAdStudioService implements AdStudioService {
  private creatives: Map<string, AdCreative> = new Map();
  private sessionCreatives: Map<string, string[]> = new Map();
  private idCounter = 0;

  constructor(
    private readonly videoGenerator: VideoGenerator,
    private readonly outputDir: string = '/tmp/ad-studio',
  ) {}

  async generateVerticalAd(sessionId: string): Promise<AdCreative> {
    const result = await this.videoGenerator.generateVerticalAd(sessionId, 15);
    const creative = this.buildCreative({
      sessionId,
      format: 'vertical-15s',
      width: 1080,
      height: 1920,
      durationSeconds: 15,
      fileSize: result.fileSize,
      mimeType: 'video/mp4',
      hasInteractiveElements: false,
    });
    this.storeCreative(creative);
    return creative;
  }

  async generateHorizontalAd(sessionId: string): Promise<AdCreative> {
    const result = await this.videoGenerator.generateHorizontalAd(sessionId, 30);
    const creative = this.buildCreative({
      sessionId,
      format: 'horizontal-30s',
      width: 1920,
      height: 1080,
      durationSeconds: 30,
      fileSize: result.fileSize,
      mimeType: 'video/mp4',
      hasInteractiveElements: false,
    });
    this.storeCreative(creative);
    return creative;
  }

  async generateBumperAd(sessionId: string): Promise<AdCreative> {
    const result = await this.videoGenerator.generateBumperAd(sessionId);
    const creative = this.buildCreative({
      sessionId,
      format: 'bumper-6s',
      width: 1920,
      height: 1080,
      durationSeconds: 6,
      fileSize: result.fileSize,
      mimeType: 'video/mp4',
      hasInteractiveElements: false,
    });
    this.storeCreative(creative);
    return creative;
  }

  async generatePlayableAd(sessionId: string): Promise<AdCreative> {
    const result = await this.videoGenerator.generatePlayableAd(sessionId);
    const creative = this.buildCreative({
      sessionId,
      format: 'playable',
      width: 1080,
      height: 1920,
      durationSeconds: 60,
      fileSize: result.fileSize,
      mimeType: 'text/html',
      hasInteractiveElements: result.hasInteractive,
    });
    this.storeCreative(creative);
    return creative;
  }

  async validateCreative(
    creativeId: string,
    network: AdNetwork,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const creative = this.creatives.get(creativeId);
    if (!creative) {
      return { valid: false, errors: [`Creative not found: ${creativeId}`] };
    }

    const spec = AD_NETWORK_SPECS.find((s) => s.network === network);
    if (!spec) {
      return { valid: false, errors: [`Unknown network: ${network}`] };
    }

    const errors = this.validateAgainstSpec(creative, spec);

    if (errors.length === 0) {
      creative.validationStatus = 'valid';
      creative.validationErrors = undefined;
      if (!creative.networkCompatibility.includes(network)) {
        creative.networkCompatibility.push(network);
      }
    } else {
      creative.validationStatus = 'invalid';
      creative.validationErrors = errors;
    }

    return { valid: errors.length === 0, errors };
  }

  async validateAllCreatives(
    sessionId: string,
  ): Promise<{ valid: boolean; errors: { creativeId: string; network: AdNetwork; errors: string[] }[] }> {
    const creativeIds = this.sessionCreatives.get(sessionId) || [];
    const allErrors: { creativeId: string; network: AdNetwork; errors: string[] }[] = [];

    for (const creativeId of creativeIds) {
      for (const spec of AD_NETWORK_SPECS) {
        const result = await this.validateCreative(creativeId, spec.network);
        if (!result.valid) {
          allErrors.push({
            creativeId,
            network: spec.network,
            errors: result.errors,
          });
        }
      }
    }

    return { valid: allErrors.length === 0, errors: allErrors };
  }

  async exportForNetwork(
    creativeId: string,
    network: AdNetwork,
  ): Promise<{ filePath: string; format: string; ready: boolean }> {
    const creative = this.creatives.get(creativeId);
    if (!creative) {
      return { filePath: '', format: '', ready: false };
    }

    const spec = AD_NETWORK_SPECS.find((s) => s.network === network);
    if (!spec) {
      return { filePath: '', format: '', ready: false };
    }

    // Validate before export
    const validation = await this.validateCreative(creativeId, network);
    if (!validation.valid) {
      return { filePath: '', format: '', ready: false };
    }

    // Determine the export format based on creative type and network support
    const format = creative.format === 'playable' ? 'html' : 'mp4';
    const extension = format;
    const exportPath = `${this.outputDir}/${network}/${creative.sessionId}/${creative.id}.${extension}`;

    return { filePath: exportPath, format, ready: true };
  }

  async getCreatives(sessionId: string): Promise<AdCreative[]> {
    const creativeIds = this.sessionCreatives.get(sessionId) || [];
    return creativeIds
      .map((id) => this.creatives.get(id))
      .filter((c): c is AdCreative => c !== undefined);
  }

  getNetworkSpecs(): AdNetworkSpec[] {
    return [...AD_NETWORK_SPECS];
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private buildCreative(params: {
    sessionId: string;
    format: AdFormat;
    width: number;
    height: number;
    durationSeconds: number;
    fileSize: number;
    mimeType: string;
    hasInteractiveElements: boolean;
  }): AdCreative {
    this.idCounter++;
    const id = `ad-creative-${this.idCounter}`;
    const extension = params.mimeType === 'text/html' ? 'html' : 'mp4';
    return {
      id,
      sessionId: params.sessionId,
      format: params.format,
      width: params.width,
      height: params.height,
      durationSeconds: params.durationSeconds,
      filePath: `${this.outputDir}/${params.sessionId}/${id}.${extension}`,
      fileSize: params.fileSize,
      mimeType: params.mimeType,
      hasInteractiveElements: params.hasInteractiveElements,
      validationStatus: 'pending',
      networkCompatibility: [],
      createdAt: new Date(),
    };
  }

  private storeCreative(creative: AdCreative): void {
    this.creatives.set(creative.id, creative);
    const sessionList = this.sessionCreatives.get(creative.sessionId) || [];
    sessionList.push(creative.id);
    this.sessionCreatives.set(creative.sessionId, sessionList);
  }

  private validateAgainstSpec(creative: AdCreative, spec: AdNetworkSpec): string[] {
    const errors: string[] = [];

    // Check format is allowed
    if (!spec.allowedFormats.includes(creative.format)) {
      errors.push(
        `Format '${creative.format}' is not allowed for ${spec.network}. Allowed: ${spec.allowedFormats.join(', ')}`,
      );
      return errors;
    }

    // Check file size
    const maxSizeBytes = spec.maxFileSizeMB * 1024 * 1024;
    if (creative.fileSize > maxSizeBytes) {
      errors.push(
        `File size ${(creative.fileSize / (1024 * 1024)).toFixed(1)}MB exceeds ${spec.network} limit of ${spec.maxFileSizeMB}MB`,
      );
    }

    // Check duration
    const maxDuration = spec.maxDurationSeconds[creative.format];
    if (creative.durationSeconds > maxDuration) {
      errors.push(
        `Duration ${creative.durationSeconds}s exceeds ${spec.network} limit of ${maxDuration}s for ${creative.format}`,
      );
    }

    // Check aspect ratio
    const expectedRatio = spec.aspectRatios[creative.format];
    if (creative.width !== expectedRatio.width || creative.height !== expectedRatio.height) {
      errors.push(
        `Aspect ratio ${creative.width}×${creative.height} does not match ${spec.network} requirement of ${expectedRatio.width}×${expectedRatio.height} for ${creative.format}`,
      );
    }

    // Check interactive elements for playable ads
    if (creative.format === 'playable' && spec.requiresInteractive && !creative.hasInteractiveElements) {
      errors.push(
        `Playable ad for ${spec.network} requires interactive elements`,
      );
    }

    return errors;
  }
}

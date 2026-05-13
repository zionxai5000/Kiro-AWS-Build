/**
 * ZXMG Video Development Studio — UGC/Ad Creative Builder
 *
 * Generates UGC-style content, ad creatives with hook→value→CTA structure,
 * and AI avatar-based video generation. Supports creating and managing
 * AI avatars with custom appearances and voice profiles.
 *
 * Requirements: 44d.21, 44d.22, 44d.23, 44d.24
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UGCCreative {
  id: string;
  type: 'ugc' | 'ad' | 'avatar';
  videoUrl: string;
  format: string;
  duration: number;
  style: string;
}

export interface AIAvatar {
  id: string;
  name: string;
  appearance: string;
  voiceProfile: string;
}

// ---------------------------------------------------------------------------
// Dependency Interfaces (injected)
// ---------------------------------------------------------------------------

export interface VideoGenerator {
  generateVideo(params: {
    type: 'ugc' | 'ad' | 'avatar';
    style: string;
    script?: string;
    avatarId?: string;
  }): Promise<{ videoUrl: string; format: string; duration: number }>;
}

export interface AvatarStore {
  save(avatar: AIAvatar): Promise<void>;
  get(avatarId: string): Promise<AIAvatar | null>;
  list(): Promise<AIAvatar[]>;
}

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface UGCBuilder {
  generateUGC(channelId: string, topic: string, style: string): Promise<UGCCreative>;
  generateAdCreative(channelId: string, hook: string, value: string, cta: string): Promise<UGCCreative>;
  createAvatar(name: string, appearance: string, voiceProfile: string): Promise<AIAvatar>;
  generateWithAvatar(avatarId: string, script: string): Promise<UGCCreative>;
  listAvatars(): Promise<AIAvatar[]>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

/**
 * Default implementation of UGCBuilder.
 *
 * Uses dependency injection for video generation and avatar storage.
 * Generates UGC content, ad creatives with hook→value→CTA structure,
 * and avatar-based videos.
 */
export class DefaultUGCBuilder implements UGCBuilder {
  private idCounter = 0;

  constructor(
    private readonly videoGenerator: VideoGenerator,
    private readonly avatarStore: AvatarStore,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Generates a UGC-style video for a given topic and style.
   */
  async generateUGC(channelId: string, topic: string, style: string): Promise<UGCCreative> {
    const result = await this.videoGenerator.generateVideo({
      type: 'ugc',
      style,
      script: `UGC content about ${topic} for channel ${channelId}`,
    });

    return {
      id: this.generateId(),
      type: 'ugc',
      videoUrl: result.videoUrl,
      format: result.format,
      duration: result.duration,
      style,
    };
  }

  /**
   * Generates an ad creative with hook→value→CTA structure.
   */
  async generateAdCreative(
    channelId: string,
    hook: string,
    value: string,
    cta: string,
  ): Promise<UGCCreative> {
    const script = `[HOOK] ${hook}\n[VALUE] ${value}\n[CTA] ${cta}`;
    const result = await this.videoGenerator.generateVideo({
      type: 'ad',
      style: 'ad-creative',
      script,
    });

    return {
      id: this.generateId(),
      type: 'ad',
      videoUrl: result.videoUrl,
      format: result.format,
      duration: result.duration,
      style: 'ad-creative',
    };
  }

  /**
   * Creates a new AI avatar with the given appearance and voice profile.
   */
  async createAvatar(name: string, appearance: string, voiceProfile: string): Promise<AIAvatar> {
    const avatar: AIAvatar = {
      id: this.generateId(),
      name,
      appearance,
      voiceProfile,
    };

    await this.avatarStore.save(avatar);
    return avatar;
  }

  /**
   * Generates a video using a previously created AI avatar.
   */
  async generateWithAvatar(avatarId: string, script: string): Promise<UGCCreative> {
    const avatar = await this.avatarStore.get(avatarId);
    if (!avatar) {
      throw new Error(`Avatar not found: ${avatarId}`);
    }

    const result = await this.videoGenerator.generateVideo({
      type: 'avatar',
      style: avatar.appearance,
      script,
      avatarId,
    });

    return {
      id: this.generateId(),
      type: 'avatar',
      videoUrl: result.videoUrl,
      format: result.format,
      duration: result.duration,
      style: avatar.appearance,
    };
  }

  /**
   * Lists all available AI avatars.
   */
  async listAvatars(): Promise<AIAvatar[]> {
    return this.avatarStore.list();
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private generateId(): string {
    this.idCounter++;
    return `ugc-${Date.now()}-${this.idCounter}`;
  }
}

/**
 * ZXMG Video Studio — Content Diversity Dashboard
 *
 * Visual grid showing usage history of avatars, voices, styles, and music.
 * Duplicate detection highlighting (red if used in last 5 videos).
 * Diversity score per channel (0-100). "Suggest Alternative" button.
 *
 * Requirements: 44b.7, 44f.30
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetType = 'avatar' | 'voice' | 'style' | 'music';

export interface ContentAsset {
  id: string;
  name: string;
  type: AssetType;
  thumbnail?: string;
  lastUsedVideoIndex: number; // 0 = current, 1 = last video, etc.
  usageCount: number;
}

export interface ChannelDiversity {
  channelId: string;
  channelName: string;
  diversityScore: number; // 0-100
}

export interface SuggestedAlternative {
  assetId: string;
  name: string;
  type: AssetType;
  reason: string;
}

export interface ContentDiversityData {
  assets: ContentAsset[];
  channels: ChannelDiversity[];
  recentVideoCount: number;
}

export interface ContentDiversityOptions {
  onSuggestAlternative?: (assetType: AssetType) => SuggestedAlternative | null;
  onAssetSelect?: (assetId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  avatar: '🧑 Avatars',
  voice: '🎙️ Voices',
  style: '🎨 Styles',
  music: '🎵 Music',
};

const DUPLICATE_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// ContentDiversityDashboard
// ---------------------------------------------------------------------------

export class ContentDiversityDashboard {
  private container: HTMLElement;
  private data: ContentDiversityData;
  private options: ContentDiversityOptions;
  private suggestion: SuggestedAlternative | null = null;
  private suggestingType: AssetType | null = null;

  constructor(container: HTMLElement, data: ContentDiversityData, options: ContentDiversityOptions = {}) {
    this.container = container;
    this.data = data;
    this.options = options;
  }

  mount(): void {
    this.render();
    this.attachListeners();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  update(data: ContentDiversityData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    const assetTypes: AssetType[] = ['avatar', 'voice', 'style', 'music'];

    this.container.innerHTML = `
      <div class="diversity-dashboard" role="region" aria-label="Content Diversity Dashboard">
        <div class="diversity-dashboard__header">
          <h3 class="diversity-dashboard__title">🎭 Content Diversity</h3>
        </div>
        <div class="diversity-dashboard__channels">
          ${this.renderChannelScores()}
        </div>
        <div class="diversity-dashboard__grid">
          ${assetTypes.map((type) => this.renderAssetSection(type)).join('')}
        </div>
        ${this.suggestion ? this.renderSuggestion() : ''}
      </div>
    `;
  }

  private renderChannelScores(): string {
    if (this.data.channels.length === 0) return '';

    const items = this.data.channels.map((ch) => {
      const scoreClass = ch.diversityScore >= 70 ? 'good' : ch.diversityScore >= 40 ? 'moderate' : 'poor';
      return `
        <div class="diversity-dashboard__channel" data-channel-id="${ch.channelId}">
          <span class="diversity-dashboard__channel-name">${ch.channelName}</span>
          <span class="diversity-dashboard__channel-score diversity-dashboard__channel-score--${scoreClass}">${ch.diversityScore}/100</span>
        </div>
      `;
    }).join('');

    return `
      <div class="diversity-dashboard__channel-list">
        <h4 class="diversity-dashboard__section-title">Diversity Scores by Channel</h4>
        ${items}
      </div>
    `;
  }

  private renderAssetSection(type: AssetType): string {
    const assets = this.data.assets.filter((a) => a.type === type);

    const items = assets.map((asset) => {
      const isDuplicate = asset.lastUsedVideoIndex >= 0 && asset.lastUsedVideoIndex < DUPLICATE_THRESHOLD;
      const duplicateClass = isDuplicate ? 'diversity-dashboard__asset--duplicate' : '';
      const duplicateLabel = isDuplicate ? `Used ${asset.lastUsedVideoIndex === 0 ? 'in current' : `${asset.lastUsedVideoIndex} video${asset.lastUsedVideoIndex !== 1 ? 's' : ''} ago`}` : '';

      return `
        <div class="diversity-dashboard__asset ${duplicateClass}" data-asset-id="${asset.id}">
          <span class="diversity-dashboard__asset-name">${asset.name}</span>
          <span class="diversity-dashboard__asset-usage">Used ${asset.usageCount}x</span>
          ${isDuplicate ? `<span class="diversity-dashboard__asset-warning">${duplicateLabel}</span>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="diversity-dashboard__section" data-asset-type="${type}">
        <div class="diversity-dashboard__section-header">
          <h4 class="diversity-dashboard__section-title">${ASSET_TYPE_LABELS[type]}</h4>
          <button class="diversity-dashboard__suggest-btn" data-suggest-type="${type}" aria-label="Suggest alternative ${type}">
            💡 Suggest Alternative
          </button>
        </div>
        <div class="diversity-dashboard__asset-grid">
          ${items.length > 0 ? items : '<span class="diversity-dashboard__empty">No assets used</span>'}
        </div>
      </div>
    `;
  }

  private renderSuggestion(): string {
    if (!this.suggestion) return '';

    return `
      <div class="diversity-dashboard__suggestion" role="alert">
        <span class="diversity-dashboard__suggestion-label">💡 Suggested:</span>
        <span class="diversity-dashboard__suggestion-name">${this.suggestion.name}</span>
        <span class="diversity-dashboard__suggestion-reason">${this.suggestion.reason}</span>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    this.container.querySelectorAll('[data-suggest-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = (btn as HTMLElement).dataset.suggestType as AssetType;
        this.suggestingType = type;
        this.suggestion = this.options.onSuggestAlternative?.(type) ?? null;
        this.render();
        this.attachListeners();
      });
    });

    this.container.querySelectorAll('[data-asset-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.assetId!;
        this.options.onAssetSelect?.(id);
      });
    });
  }
}

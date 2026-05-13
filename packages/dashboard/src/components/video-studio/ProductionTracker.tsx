/**
 * ZXMG Video Studio — End-to-End Production Tracker
 *
 * Horizontal timeline per video showing journey:
 * Script → Scenes → Render → Assemble → Review → Publish → Distribute → Live
 *
 * Status dots: gray (pending), blue (in progress), green (complete), red (failed).
 * Time-in-stage display, upload queue, platform connection health.
 * Uses our own Multi-Model Video Router (not HeyGen).
 *
 * Requirements: 44b.7, 44g.35, 44g.36
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProductionStage =
  | 'script'
  | 'scenes'
  | 'render'
  | 'assemble'
  | 'review'
  | 'publish'
  | 'distribute'
  | 'live';

export type StageStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

export type PlatformHealth = 'connected' | 'disconnected' | 'rate_limited';

export interface StageInfo {
  stage: ProductionStage;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

export interface VideoProduction {
  id: string;
  title: string;
  stages: StageInfo[];
  createdAt: string;
}

export interface PlatformUpload {
  id: string;
  videoId: string;
  platform: string;
  status: 'queued' | 'uploading' | 'complete' | 'failed';
  progress: number; // 0-100
}

export interface PlatformConnection {
  platform: string;
  health: PlatformHealth;
  lastChecked: string;
}

export interface ProductionTrackerData {
  productions: VideoProduction[];
  uploadQueue: PlatformUpload[];
  platformConnections: PlatformConnection[];
}

export interface ProductionTrackerOptions {
  onVideoClick?: (videoId: string) => void;
  onRetryUpload?: (uploadId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_ORDER: ProductionStage[] = [
  'script', 'scenes', 'render', 'assemble', 'review', 'publish', 'distribute', 'live',
];

const STAGE_LABELS: Record<ProductionStage, string> = {
  script: 'Script',
  scenes: 'Scenes',
  render: 'Render',
  assemble: 'Assemble',
  review: 'Review',
  publish: 'Publish',
  distribute: 'Distribute',
  live: 'Live',
};

const STATUS_COLORS: Record<StageStatus, string> = {
  pending: 'gray',
  in_progress: 'blue',
  complete: 'green',
  failed: 'red',
};

const HEALTH_ICONS: Record<PlatformHealth, string> = {
  connected: '🟢',
  disconnected: '🔴',
  rate_limited: '🟡',
};

// ---------------------------------------------------------------------------
// EndToEndProductionTracker
// ---------------------------------------------------------------------------

export class EndToEndProductionTracker {
  private container: HTMLElement;
  private data: ProductionTrackerData;
  private options: ProductionTrackerOptions;

  constructor(container: HTMLElement, data: ProductionTrackerData, options: ProductionTrackerOptions = {}) {
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

  update(data: ProductionTrackerData): void {
    this.data = data;
    this.render();
    this.attachListeners();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private render(): void {
    this.container.innerHTML = `
      <div class="production-tracker" role="region" aria-label="End-to-End Production Tracker">
        <div class="production-tracker__header">
          <h3 class="production-tracker__title">🎬 Production Tracker</h3>
          <span class="production-tracker__subtitle">Multi-Model Video Router Pipeline</span>
        </div>
        <div class="production-tracker__timelines">
          ${this.data.productions.map((p) => this.renderTimeline(p)).join('')}
        </div>
        ${this.renderUploadQueue()}
        ${this.renderPlatformHealth()}
      </div>
    `;
  }

  private renderTimeline(production: VideoProduction): string {
    const stages = STAGE_ORDER.map((stageName) => {
      const stageInfo = production.stages.find((s) => s.stage === stageName);
      return stageInfo || { stage: stageName, status: 'pending' as StageStatus };
    });

    const dots = stages.map((stage) => {
      const color = STATUS_COLORS[stage.status];
      const duration = stage.durationMs ? this.formatDuration(stage.durationMs) : '';
      const errorTitle = stage.error ? ` - Error: ${stage.error}` : '';

      return `
        <div class="production-tracker__stage" data-stage="${stage.stage}" data-status="${stage.status}">
          <div class="production-tracker__dot production-tracker__dot--${color}"
               title="${STAGE_LABELS[stage.stage]}: ${stage.status}${errorTitle}"
               aria-label="${STAGE_LABELS[stage.stage]} - ${stage.status}">
          </div>
          <span class="production-tracker__stage-label">${STAGE_LABELS[stage.stage]}</span>
          ${duration ? `<span class="production-tracker__stage-duration">${duration}</span>` : ''}
        </div>
      `;
    }).join('<div class="production-tracker__connector"></div>');

    return `
      <div class="production-tracker__timeline" data-video-id="${production.id}">
        <div class="production-tracker__timeline-header">
          <span class="production-tracker__video-title">${production.title}</span>
        </div>
        <div class="production-tracker__stages">
          ${dots}
        </div>
      </div>
    `;
  }

  private renderUploadQueue(): string {
    if (this.data.uploadQueue.length === 0) return '';

    const items = this.data.uploadQueue.map((upload) => `
      <div class="production-tracker__upload" data-upload-id="${upload.id}">
        <span class="production-tracker__upload-platform">${upload.platform}</span>
        <span class="production-tracker__upload-status production-tracker__upload-status--${upload.status}">${upload.status}</span>
        <div class="production-tracker__upload-progress">
          <div class="production-tracker__upload-bar" style="width: ${upload.progress}%"></div>
        </div>
        ${upload.status === 'failed' ? `<button class="production-tracker__retry-btn" data-retry-id="${upload.id}">Retry</button>` : ''}
      </div>
    `).join('');

    return `
      <div class="production-tracker__queue">
        <h4 class="production-tracker__queue-title">📤 Upload Queue</h4>
        <div class="production-tracker__queue-list">${items}</div>
      </div>
    `;
  }

  private renderPlatformHealth(): string {
    if (this.data.platformConnections.length === 0) return '';

    const items = this.data.platformConnections.map((conn) => `
      <div class="production-tracker__platform" data-platform="${conn.platform}">
        <span class="production-tracker__platform-icon">${HEALTH_ICONS[conn.health]}</span>
        <span class="production-tracker__platform-name">${conn.platform}</span>
        <span class="production-tracker__platform-health production-tracker__platform-health--${conn.health}">${conn.health}</span>
      </div>
    `).join('');

    return `
      <div class="production-tracker__platforms">
        <h4 class="production-tracker__platforms-title">🌐 Platform Connections</h4>
        <div class="production-tracker__platform-list">${items}</div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  private attachListeners(): void {
    this.container.querySelectorAll('[data-video-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const videoId = (el as HTMLElement).dataset.videoId!;
        this.options.onVideoClick?.(videoId);
      });
    });

    this.container.querySelectorAll('[data-retry-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uploadId = (btn as HTMLElement).dataset.retryId!;
        this.options.onRetryUpload?.(uploadId);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
}

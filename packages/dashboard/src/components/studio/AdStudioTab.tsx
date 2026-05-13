/**
 * ZionX App Development Studio — Ad Studio Tab
 *
 * Creative list with type, format, duration, and validation status.
 * Video preview player placeholder. "Generate Ads" button with format selection.
 * Export buttons per ad network (AdMob, AppLovin, Unity).
 *
 * Requirements: 42i.28, 42i.29, 42i.30
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdFormat = '15s-vertical' | '30s-horizontal' | '6s-bumper' | 'playable';
export type AdValidationStatus = 'valid' | 'invalid' | 'pending' | 'generating';
export type AdNetwork = 'admob' | 'applovin' | 'unity';

export interface AdCreative {
  id: string;
  name: string;
  type: string;
  format: AdFormat;
  duration: number;
  validationStatus: AdValidationStatus;
  previewUrl?: string;
  validationIssue?: string;
}

export interface AdStudioTabProps {
  creatives: AdCreative[];
  selectedCreativeId?: string;
  isGenerating: boolean;
  onGenerateAds?: (formats: AdFormat[]) => void;
  onSelectCreative?: (id: string) => void;
  onExport?: (creativeId: string, network: AdNetwork) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FORMAT_LABELS: Record<AdFormat, string> = {
  '15s-vertical': '15s Vertical',
  '30s-horizontal': '30s Horizontal',
  '6s-bumper': '6s Bumper',
  playable: 'Playable Demo',
};

const VALIDATION_ICONS: Record<AdValidationStatus, string> = {
  valid: '✅',
  invalid: '❌',
  pending: '⏳',
  generating: '🔄',
};

const NETWORK_LABELS: Record<AdNetwork, string> = {
  admob: 'AdMob',
  applovin: 'AppLovin',
  unity: 'Unity Ads',
};

const AD_NETWORKS: AdNetwork[] = ['admob', 'applovin', 'unity'];

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function renderCreativeRow(creative: AdCreative, isSelected: boolean): string {
  return `
    <div class="ad-studio__creative-row ${isSelected ? 'ad-studio__creative-row--selected' : ''}"
         data-creative-id="${creative.id}">
      <span class="ad-studio__creative-name">${creative.name}</span>
      <span class="ad-studio__creative-type">${creative.type}</span>
      <span class="ad-studio__creative-format">${FORMAT_LABELS[creative.format]}</span>
      <span class="ad-studio__creative-duration">${creative.duration}s</span>
      <span class="ad-studio__creative-status">${VALIDATION_ICONS[creative.validationStatus]}</span>
      ${creative.validationIssue ? `<span class="ad-studio__creative-issue">${creative.validationIssue}</span>` : ''}
    </div>
  `;
}

function renderVideoPreview(creative: AdCreative | undefined): string {
  if (!creative) {
    return `
      <div class="ad-studio__preview-placeholder">
        <p>Select a creative to preview</p>
      </div>
    `;
  }

  if (!creative.previewUrl) {
    return `
      <div class="ad-studio__preview-placeholder">
        <p>Preview not available for "${creative.name}"</p>
      </div>
    `;
  }

  return `
    <div class="ad-studio__preview-player" data-creative-id="${creative.id}">
      <div class="ad-studio__video-container">
        <video
          class="ad-studio__video"
          src="${creative.previewUrl}"
          controls
          preload="metadata"
        ></video>
      </div>
      <div class="ad-studio__preview-info">
        <span class="ad-studio__preview-name">${creative.name}</span>
        <span class="ad-studio__preview-format">${FORMAT_LABELS[creative.format]} — ${creative.duration}s</span>
      </div>
    </div>
  `;
}

function renderExportButtons(creativeId: string | undefined): string {
  if (!creativeId) return '';

  const buttons = AD_NETWORKS.map(
    (network) => `
    <button
      class="ad-studio__export-btn"
      data-export-network="${network}"
      data-export-creative="${creativeId}"
    >
      Export to ${NETWORK_LABELS[network]}
    </button>
  `,
  ).join('');

  return `
    <div class="ad-studio__export-section">
      <h4 class="ad-studio__export-title">Export</h4>
      <div class="ad-studio__export-buttons">
        ${buttons}
      </div>
    </div>
  `;
}

function renderFormatSelector(): string {
  const checkboxes = Object.entries(FORMAT_LABELS)
    .map(
      ([format, label]) => `
      <label class="ad-studio__format-option">
        <input type="checkbox" value="${format}" data-format-checkbox checked />
        <span>${label}</span>
      </label>
    `,
    )
    .join('');

  return `
    <div class="ad-studio__format-selector">
      ${checkboxes}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Main Render
// ---------------------------------------------------------------------------

/**
 * Renders the ad studio tab as an HTML string.
 */
export function renderAdStudioTab(props: AdStudioTabProps): string {
  const selectedCreative = props.creatives.find((c) => c.id === props.selectedCreativeId);
  const creativesHtml = props.creatives
    .map((c) => renderCreativeRow(c, c.id === props.selectedCreativeId))
    .join('');

  return `
    <div class="studio-ad-studio">
      <div class="ad-studio__header">
        <h3 class="ad-studio__title">Ad Studio</h3>
        <div class="ad-studio__generate-section">
          ${renderFormatSelector()}
          <button
            class="ad-studio__generate-btn"
            data-generate-ads
            ${props.isGenerating ? 'disabled' : ''}
          >
            ${props.isGenerating ? '🔄 Generating...' : '🎬 Generate Ads'}
          </button>
        </div>
      </div>

      <div class="ad-studio__content">
        <div class="ad-studio__creative-list">
          <h4 class="ad-studio__list-title">Creatives</h4>
          <div class="ad-studio__list-header">
            <span>Name</span>
            <span>Type</span>
            <span>Format</span>
            <span>Duration</span>
            <span>Status</span>
          </div>
          ${creativesHtml || '<p class="ad-studio__empty">No creatives generated yet</p>'}
        </div>

        <div class="ad-studio__preview-section">
          <h4 class="ad-studio__preview-title">Preview</h4>
          ${renderVideoPreview(selectedCreative)}
        </div>
      </div>

      ${renderExportButtons(props.selectedCreativeId)}
    </div>
  `;
}

/**
 * Creates a DOM element for the ad studio tab.
 */
export function createAdStudioTabElement(props: AdStudioTabProps): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderAdStudioTab(props);
  return container.firstElementChild as HTMLElement;
}

/**
 * Attaches event listeners for generate, select, and export actions.
 */
export function attachAdStudioListeners(
  root: HTMLElement,
  props: AdStudioTabProps,
): void {
  // Generate ads button
  const generateBtn = root.querySelector<HTMLButtonElement>('[data-generate-ads]');
  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      const checkboxes = root.querySelectorAll<HTMLInputElement>('[data-format-checkbox]:checked');
      const formats = Array.from(checkboxes).map((cb) => cb.value as AdFormat);
      props.onGenerateAds?.(formats);
    });
  }

  // Creative selection
  const creativeRows = root.querySelectorAll<HTMLElement>('[data-creative-id]');
  creativeRows.forEach((row) => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-creative-id')!;
      props.onSelectCreative?.(id);
    });
  });

  // Export buttons
  const exportBtns = root.querySelectorAll<HTMLButtonElement>('[data-export-network]');
  exportBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const network = btn.getAttribute('data-export-network') as AdNetwork;
      const creativeId = btn.getAttribute('data-export-creative')!;
      props.onExport?.(creativeId, network);
    });
  });
}

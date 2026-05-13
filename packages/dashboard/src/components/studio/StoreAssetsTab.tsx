/**
 * ZionX App Development Studio — Store Assets Tab
 *
 * Screenshot grid organized by device size with validation status indicators.
 * App icon, feature graphic, and promo banner preview. "Generate All Assets"
 * button and individual regeneration. Validation issue display with
 * remediation instructions.
 *
 * Requirements: 42h.24, 42h.25, 42h.26
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetValidationStatus = 'valid' | 'invalid' | 'pending' | 'generating';

export interface ScreenshotAsset {
  id: string;
  deviceSize: string;
  url?: string;
  caption?: string;
  validationStatus: AssetValidationStatus;
  validationIssue?: string;
}

export interface AppIconAsset {
  url?: string;
  validationStatus: AssetValidationStatus;
  validationIssue?: string;
}

export interface GraphicAsset {
  id: string;
  type: 'feature-graphic' | 'promo-banner';
  label: string;
  url?: string;
  validationStatus: AssetValidationStatus;
  validationIssue?: string;
}

export interface ValidationIssue {
  assetId: string;
  assetLabel: string;
  issue: string;
  remediation: string;
}

export interface StoreAssetsTabProps {
  screenshots: ScreenshotAsset[];
  appIcon: AppIconAsset;
  graphics: GraphicAsset[];
  validationIssues: ValidationIssue[];
  isGenerating: boolean;
  onGenerateAll?: () => void;
  onRegenerateAsset?: (assetId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALIDATION_ICONS: Record<AssetValidationStatus, string> = {
  valid: '✅',
  invalid: '❌',
  pending: '⏳',
  generating: '🔄',
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function renderScreenshotCard(screenshot: ScreenshotAsset): string {
  const imageContent = screenshot.url
    ? `<img class="store-assets__screenshot-img" src="${screenshot.url}" alt="${screenshot.caption ?? screenshot.deviceSize}" />`
    : `<div class="store-assets__screenshot-placeholder">No screenshot</div>`;

  return `
    <div class="store-assets__screenshot-card" data-asset-id="${screenshot.id}" data-status="${screenshot.validationStatus}">
      ${imageContent}
      <div class="store-assets__screenshot-meta">
        <span class="store-assets__device-size">${screenshot.deviceSize}</span>
        <span class="store-assets__validation-icon">${VALIDATION_ICONS[screenshot.validationStatus]}</span>
      </div>
      ${screenshot.caption ? `<p class="store-assets__caption">${screenshot.caption}</p>` : ''}
      ${screenshot.validationIssue ? `<p class="store-assets__issue">${screenshot.validationIssue}</p>` : ''}
      <button class="store-assets__regenerate-btn" data-regenerate="${screenshot.id}">↻ Regenerate</button>
    </div>
  `;
}

function renderAppIcon(icon: AppIconAsset): string {
  const imageContent = icon.url
    ? `<img class="store-assets__icon-img" src="${icon.url}" alt="App Icon" />`
    : `<div class="store-assets__icon-placeholder">No icon</div>`;

  return `
    <div class="store-assets__icon-section">
      <h4 class="store-assets__section-title">App Icon</h4>
      <div class="store-assets__icon-card" data-status="${icon.validationStatus}">
        ${imageContent}
        <span class="store-assets__validation-icon">${VALIDATION_ICONS[icon.validationStatus]}</span>
      </div>
      ${icon.validationIssue ? `<p class="store-assets__issue">${icon.validationIssue}</p>` : ''}
    </div>
  `;
}

function renderGraphicAsset(graphic: GraphicAsset): string {
  const imageContent = graphic.url
    ? `<img class="store-assets__graphic-img" src="${graphic.url}" alt="${graphic.label}" />`
    : `<div class="store-assets__graphic-placeholder">No ${graphic.label}</div>`;

  return `
    <div class="store-assets__graphic-card" data-asset-id="${graphic.id}" data-status="${graphic.validationStatus}">
      <h5 class="store-assets__graphic-label">${graphic.label}</h5>
      ${imageContent}
      <span class="store-assets__validation-icon">${VALIDATION_ICONS[graphic.validationStatus]}</span>
      ${graphic.validationIssue ? `<p class="store-assets__issue">${graphic.validationIssue}</p>` : ''}
      <button class="store-assets__regenerate-btn" data-regenerate="${graphic.id}">↻ Regenerate</button>
    </div>
  `;
}

function renderValidationIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) return '';

  const issuesHtml = issues
    .map(
      (issue) => `
      <div class="store-assets__validation-item">
        <span class="store-assets__validation-asset">${issue.assetLabel}</span>
        <p class="store-assets__validation-issue">${issue.issue}</p>
        <p class="store-assets__validation-remediation">💡 ${issue.remediation}</p>
      </div>
    `,
    )
    .join('');

  return `
    <div class="store-assets__validation-section">
      <h4 class="store-assets__section-title">Validation Issues</h4>
      <div class="store-assets__validation-list">
        ${issuesHtml}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Main Render
// ---------------------------------------------------------------------------

/**
 * Renders the store assets tab as an HTML string.
 */
export function renderStoreAssetsTab(props: StoreAssetsTabProps): string {
  const screenshotsHtml = props.screenshots.map(renderScreenshotCard).join('');
  const graphicsHtml = props.graphics.map(renderGraphicAsset).join('');

  return `
    <div class="studio-store-assets">
      <div class="store-assets__header">
        <h3 class="store-assets__title">Store Assets</h3>
        <button
          class="store-assets__generate-all-btn"
          data-generate-all
          ${props.isGenerating ? 'disabled' : ''}
        >
          ${props.isGenerating ? '🔄 Generating...' : '✨ Generate All Assets'}
        </button>
      </div>

      ${renderAppIcon(props.appIcon)}

      <div class="store-assets__screenshots-section">
        <h4 class="store-assets__section-title">Screenshots</h4>
        <div class="store-assets__screenshot-grid">
          ${screenshotsHtml}
        </div>
      </div>

      <div class="store-assets__graphics-section">
        <h4 class="store-assets__section-title">Graphics</h4>
        <div class="store-assets__graphics-grid">
          ${graphicsHtml}
        </div>
      </div>

      ${renderValidationIssues(props.validationIssues)}
    </div>
  `;
}

/**
 * Creates a DOM element for the store assets tab.
 */
export function createStoreAssetsTabElement(props: StoreAssetsTabProps): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderStoreAssetsTab(props);
  return container.firstElementChild as HTMLElement;
}

/**
 * Attaches event listeners for generate and regenerate buttons.
 */
export function attachStoreAssetsListeners(
  root: HTMLElement,
  props: StoreAssetsTabProps,
): void {
  const generateAllBtn = root.querySelector<HTMLButtonElement>('[data-generate-all]');
  if (generateAllBtn) {
    generateAllBtn.addEventListener('click', () => {
      props.onGenerateAll?.();
    });
  }

  const regenerateBtns = root.querySelectorAll<HTMLButtonElement>('[data-regenerate]');
  regenerateBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const assetId = btn.getAttribute('data-regenerate')!;
      props.onRegenerateAsset?.(assetId);
    });
  });
}

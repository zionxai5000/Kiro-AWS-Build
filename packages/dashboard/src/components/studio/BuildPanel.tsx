/**
 * ZionX App Development Studio — Build/Submit Panel Component
 *
 * Displays iOS and Android build status cards with progress, signing,
 * metadata, privacy/data safety, screenshots, and IAP/billing status.
 * Includes "Submit to App Store" and "Submit to Play Store" buttons.
 *
 * Requirements: 42g.19, 42g.20, 42g.21
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BuildStepStatus = 'pending' | 'in-progress' | 'complete' | 'error';

export interface BuildStep {
  id: string;
  label: string;
  status: BuildStepStatus;
  detail?: string;
}

export interface PlatformBuild {
  platform: 'ios' | 'android';
  progress: number;
  steps: BuildStep[];
  canSubmit: boolean;
  lastBuildTime?: string;
  version?: string;
}

export interface BuildPanelProps {
  ios: PlatformBuild;
  android: PlatformBuild;
  onSubmitIOS?: () => void;
  onSubmitAndroid?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_STATUS_ICONS: Record<BuildStepStatus, string> = {
  pending: '⬜',
  'in-progress': '🔄',
  complete: '✅',
  error: '❌',
};

const IOS_STEPS: string[] = [
  'Build Progress',
  'Code Signing',
  'Metadata',
  'Privacy Nutrition Labels',
  'Screenshots',
  'In-App Purchases',
];

const ANDROID_STEPS: string[] = [
  'Build Progress',
  'App Signing',
  'Metadata',
  'Data Safety',
  'Screenshots',
  'Billing Integration',
];

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function renderBuildStep(step: BuildStep): string {
  return `
    <div class="build-panel__step" data-step-status="${step.status}">
      <span class="build-panel__step-icon">${STEP_STATUS_ICONS[step.status]}</span>
      <span class="build-panel__step-label">${step.label}</span>
      ${step.detail ? `<span class="build-panel__step-detail">${step.detail}</span>` : ''}
    </div>
  `;
}

function renderProgressBar(progress: number): string {
  const percentage = Math.min(100, Math.max(0, progress));
  return `
    <div class="build-panel__progress">
      <div class="build-panel__progress-bar">
        <div class="build-panel__progress-fill" style="width: ${percentage}%;"></div>
      </div>
      <span class="build-panel__progress-label">${percentage}%</span>
    </div>
  `;
}

function renderPlatformCard(
  build: PlatformBuild,
  submitLabel: string,
  submitAction: string,
): string {
  const platformIcon = build.platform === 'ios' ? '🍎' : '🤖';
  const platformName = build.platform === 'ios' ? 'iOS' : 'Android';

  const stepsHtml = build.steps.map(renderBuildStep).join('');

  return `
    <div class="build-panel__card" data-platform="${build.platform}">
      <div class="build-panel__card-header">
        <span class="build-panel__platform-icon">${platformIcon}</span>
        <h4 class="build-panel__platform-name">${platformName} Build</h4>
        ${build.version ? `<span class="build-panel__version">v${build.version}</span>` : ''}
      </div>
      ${renderProgressBar(build.progress)}
      <div class="build-panel__steps">
        ${stepsHtml}
      </div>
      ${build.lastBuildTime ? `<p class="build-panel__last-build">Last build: ${build.lastBuildTime}</p>` : ''}
      <button
        class="build-panel__submit-btn"
        data-submit-action="${submitAction}"
        ${build.canSubmit ? '' : 'disabled'}
      >
        ${submitLabel}
      </button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Main Render
// ---------------------------------------------------------------------------

/**
 * Renders the build panel as an HTML string.
 */
export function renderBuildPanel(props: BuildPanelProps): string {
  return `
    <div class="studio-build-panel">
      <h3 class="build-panel__title">Build &amp; Submit</h3>
      <div class="build-panel__cards">
        ${renderPlatformCard(props.ios, 'Submit to App Store', 'submit-ios')}
        ${renderPlatformCard(props.android, 'Submit to Play Store', 'submit-android')}
      </div>
    </div>
  `;
}

/**
 * Creates a DOM element for the build panel.
 */
export function createBuildPanelElement(props: BuildPanelProps): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderBuildPanel(props);
  return container.firstElementChild as HTMLElement;
}

/**
 * Attaches event listeners for submit buttons.
 */
export function attachBuildPanelListeners(
  root: HTMLElement,
  props: BuildPanelProps,
): void {
  const submitBtns = root.querySelectorAll<HTMLButtonElement>('[data-submit-action]');
  submitBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-submit-action');
      if (action === 'submit-ios') {
        props.onSubmitIOS?.();
      } else if (action === 'submit-android') {
        props.onSubmitAndroid?.();
      }
    });
  });
}

/**
 * ZionX App Development Studio — Studio Layout and Tab Structure
 *
 * Main studio layout with three-panel design:
 * - Left panel: Integration Sidebar with service connection toggles + Autonomous Pipeline View
 * - Center panel: Tab bar (Preview | Store Assets | Ad Studio | Revenue) with content switching
 * - Right panel: ZionX Chat, File Tree, Test Results, Build Status
 *
 * The left panel now includes the autonomous ideation pipeline view alongside
 * the existing chat, showing ranked app ideas with "Generate" buttons.
 *
 * Requirements: 42a.1, 42b.4, 42c.8, 42e.13, 45e.16, 45e.17, 45e.18, 45e.19
 */

import { IdeationPipelineView } from '../components/app-studio/IdeationPipelineView.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StudioTab = 'preview' | 'store-assets' | 'ad-studio' | 'revenue';
export type LeftPanelMode = 'chat' | 'pipeline';

export interface IntegrationToggle {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
}

export interface ZionXStudioProps {
  activeTab: StudioTab;
  integrations: IntegrationToggle[];
  centerContent: string;
  chatContent?: string;
  fileTreeContent?: string;
  testResultsContent?: string;
  buildStatusContent?: string;
  leftPanelMode?: LeftPanelMode;
  onTabChange?: (tab: StudioTab) => void;
  onIntegrationToggle?: (id: string, enabled: boolean) => void;
  onGenerate?: (ideaId: string) => void;
  onDismiss?: (ideaId: string) => void;
  onBookmark?: (ideaId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS: { id: StudioTab; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'store-assets', label: 'Store Assets' },
  { id: 'ad-studio', label: 'Ad Studio' },
  { id: 'revenue', label: 'Revenue' },
];

// ---------------------------------------------------------------------------
// Render Functions
// ---------------------------------------------------------------------------

function renderIntegrationSidebar(integrations: IntegrationToggle[]): string {
  const items = integrations
    .map(
      (integration) => `
      <div class="studio-sidebar__item" data-integration-id="${integration.id}">
        <span class="studio-sidebar__icon">${integration.icon}</span>
        <span class="studio-sidebar__name">${integration.name}</span>
        <label class="studio-sidebar__toggle">
          <input
            type="checkbox"
            ${integration.connected ? 'checked' : ''}
            data-integration-toggle="${integration.id}"
          />
          <span class="studio-sidebar__toggle-slider"></span>
        </label>
      </div>
    `,
    )
    .join('');

  return `
    <aside class="studio-sidebar">
      <h3 class="studio-sidebar__title">Integrations</h3>
      <div class="studio-sidebar__list">
        ${items}
      </div>
    </aside>
  `;
}

function renderTabBar(activeTab: StudioTab): string {
  const tabs = TABS.map(
    (tab) => `
    <button
      class="studio-tabs__tab ${tab.id === activeTab ? 'studio-tabs__tab--active' : ''}"
      data-tab="${tab.id}"
    >
      ${tab.label}
    </button>
  `,
  ).join('');

  return `
    <nav class="studio-tabs">
      ${tabs}
    </nav>
  `;
}

function renderLeftPanelToggle(mode: LeftPanelMode): string {
  return `
    <div class="studio-left-panel__toggle">
      <button class="studio-left-panel__toggle-btn ${mode === 'chat' ? 'studio-left-panel__toggle-btn--active' : ''}" data-left-panel-mode="chat">
        💬 Chat
      </button>
      <button class="studio-left-panel__toggle-btn ${mode === 'pipeline' ? 'studio-left-panel__toggle-btn--active' : ''}" data-left-panel-mode="pipeline">
        🚀 Pipeline
      </button>
    </div>
  `;
}

function renderRightPanel(props: ZionXStudioProps): string {
  return `
    <aside class="studio-right-panel">
      <section class="studio-right-panel__section studio-right-panel__chat">
        <h4 class="studio-right-panel__heading">ZionX Chat</h4>
        <div class="studio-right-panel__content">
          ${props.chatContent ?? '<p class="studio-right-panel__placeholder">Chat with ZionX to build your app...</p>'}
        </div>
      </section>
      <section class="studio-right-panel__section studio-right-panel__file-tree">
        <h4 class="studio-right-panel__heading">File Tree</h4>
        <div class="studio-right-panel__content">
          ${props.fileTreeContent ?? '<p class="studio-right-panel__placeholder">No project loaded</p>'}
        </div>
      </section>
      <section class="studio-right-panel__section studio-right-panel__test-results">
        <h4 class="studio-right-panel__heading">Test Results</h4>
        <div class="studio-right-panel__content">
          ${props.testResultsContent ?? '<p class="studio-right-panel__placeholder">No tests run yet</p>'}
        </div>
      </section>
      <section class="studio-right-panel__section studio-right-panel__build-status">
        <h4 class="studio-right-panel__heading">Build Status</h4>
        <div class="studio-right-panel__content">
          ${props.buildStatusContent ?? '<p class="studio-right-panel__placeholder">No builds started</p>'}
        </div>
      </section>
    </aside>
  `;
}

// ---------------------------------------------------------------------------
// Main Render
// ---------------------------------------------------------------------------

/**
 * Renders the ZionX Studio layout as an HTML string.
 * The left panel now includes a toggle between Chat and Pipeline views.
 */
export function renderZionXStudio(props: ZionXStudioProps): string {
  const leftPanelMode = props.leftPanelMode ?? 'pipeline';

  return `
    <div class="studio-layout">
      ${renderIntegrationSidebar(props.integrations)}
      <div class="studio-left-panel">
        ${renderLeftPanelToggle(leftPanelMode)}
        <div class="studio-left-panel__content">
          ${leftPanelMode === 'chat'
            ? `<div class="studio-left-panel__chat">
                ${props.chatContent ?? '<p class="studio-right-panel__placeholder">Chat with ZionX to build your app...</p>'}
              </div>`
            : `<div class="studio-left-panel__pipeline" id="pipeline-container"></div>`
          }
        </div>
      </div>
      <main class="studio-center">
        ${renderTabBar(props.activeTab)}
        <div class="studio-center__content" data-active-tab="${props.activeTab}">
          ${props.centerContent}
        </div>
      </main>
      ${renderRightPanel(props)}
    </div>
  `;
}

/**
 * Creates a DOM element for the ZionX Studio layout.
 */
export function createZionXStudioElement(props: ZionXStudioProps): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderZionXStudio(props);
  return container.firstElementChild as HTMLElement;
}

/**
 * Attaches event listeners for tab switching, integration toggles,
 * left panel mode switching, and mounts the pipeline view when active.
 */
export function attachStudioListeners(
  root: HTMLElement,
  props: ZionXStudioProps,
): { pipelineView: IdeationPipelineView | null } {
  let pipelineView: IdeationPipelineView | null = null;

  // Tab switching
  const tabs = root.querySelectorAll<HTMLButtonElement>('[data-tab]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab') as StudioTab;
      props.onTabChange?.(tabId);
    });
  });

  // Integration toggles
  const toggles = root.querySelectorAll<HTMLInputElement>('[data-integration-toggle]');
  toggles.forEach((toggle) => {
    toggle.addEventListener('change', () => {
      const id = toggle.getAttribute('data-integration-toggle')!;
      props.onIntegrationToggle?.(id, toggle.checked);
    });
  });

  // Left panel mode toggle
  const modeButtons = root.querySelectorAll<HTMLButtonElement>('[data-left-panel-mode]');
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-left-panel-mode') as LeftPanelMode;
      if (mode !== props.leftPanelMode) {
        props.leftPanelMode = mode;
        // Re-render the full layout
        root.innerHTML = renderZionXStudio(props);
        const result = attachStudioListeners(root, props);
        pipelineView = result.pipelineView;
      }
    });
  });

  // Mount pipeline view if in pipeline mode
  const pipelineContainer = root.querySelector('#pipeline-container') as HTMLElement;
  if (pipelineContainer) {
    pipelineView = new IdeationPipelineView(pipelineContainer, {
      onGenerate: props.onGenerate,
      onDismiss: props.onDismiss,
      onBookmark: props.onBookmark,
    });
    pipelineView.mount();
  }

  return { pipelineView };
}

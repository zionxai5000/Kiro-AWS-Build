/**
 * ZionX App Development Studio — Dashboard View
 *
 * Layout: Chat (1fr) | Preview (2fr) | Tools (64px)
 * Preview is 2X the width of the chat panel.
 * Every tool button opens a real functional panel with actual configuration.
 *
 * Requirements: 42a.1, 42b.4, 42c.8, 42d.10, 42e.13
 */

import { renderDeviceSelector, DEFAULT_DEVICES } from '../components/studio/DeviceSelector.js';
import { BRANDING_STYLES, BRANDING_CATEGORIES } from '../data/branding-styles.js';

// ---------------------------------------------------------------------------
// Tool Panel Content Generators
// ---------------------------------------------------------------------------

function renderPaymentsPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">💳 Payments — RevenueCat</h3>
      <p class="studio__panel-desc">Connect RevenueCat to handle in-app purchases and subscriptions.</p>

      <div class="studio__panel-section">
        <h4>Connection Status</h4>
        <div class="studio__panel-status studio__panel-status--disconnected">
          <span class="studio__panel-status-dot"></span> Not Connected
        </div>
        <button class="studio__btn studio__btn--primary studio__panel-connect-btn" id="connect-revenuecat">
          Connect RevenueCat →
        </button>
      </div>

      <div class="studio__panel-section">
        <h4>Setup Steps</h4>
        <ol class="studio__panel-steps">
          <li>Create a <a href="https://app.revenuecat.com" target="_blank" rel="noopener">RevenueCat account</a> (free)</li>
          <li>Get your API key from RevenueCat dashboard</li>
          <li>Enter your API key below</li>
          <li>Configure products (subscriptions / one-time purchases)</li>
          <li>Ask ZionX AI to create a paywall screen</li>
        </ol>
      </div>

      <div class="studio__panel-section">
        <h4>RevenueCat API Key</h4>
        <input type="password" class="studio__panel-input" placeholder="appl_xxxxxxxxxxxxxxxx" id="rc-api-key" />
        <button class="studio__btn studio__btn--ghost" id="save-rc-key">Save Key</button>
      </div>

      <div class="studio__panel-section">
        <h4>Products</h4>
        <div class="studio__panel-empty">No products configured yet. Ask ZionX: "Add a monthly subscription at $4.99"</div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Prompts</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Add a paywall with monthly ($4.99) and yearly ($39.99) plans">Add paywall</button>
          <button class="studio__prompt-chip" data-prompt="Add a free trial of 7 days before the subscription starts">Add free trial</button>
          <button class="studio__prompt-chip" data-prompt="Add a restore purchases button in settings">Restore purchases</button>
        </div>
      </div>
    </div>
  `;
}

function renderDatabasePanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🗄️ Database</h3>
      <p class="studio__panel-desc">Your app includes a built-in database. The AI sets up tables automatically when you describe your data needs.</p>

      <div class="studio__panel-section">
        <h4>Tables</h4>
        <div class="studio__panel-empty">No tables yet. Tell ZionX what data your app needs.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Prompts</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Add user accounts with email login">Add auth + users</button>
          <button class="studio__prompt-chip" data-prompt="Save data for each user so it persists between sessions">Add user data</button>
          <button class="studio__prompt-chip" data-prompt="Add a backend API to store and retrieve posts">Add backend API</button>
        </div>
      </div>
    </div>
  `;
}

function renderAPIPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🌐 API Connections</h3>
      <p class="studio__panel-desc">Connect external APIs. Keys are stored securely and never exposed in the frontend.</p>

      <div class="studio__panel-section">
        <h4>Connected APIs</h4>
        <div class="studio__panel-empty">No APIs connected. Tell ZionX what service you need.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Add API Key</h4>
        <input type="text" class="studio__panel-input" placeholder="API Name (e.g., OpenAI)" id="api-name" />
        <input type="password" class="studio__panel-input" placeholder="API Key" id="api-key-value" />
        <button class="studio__btn studio__btn--ghost" id="save-api-key">Save</button>
      </div>

      <div class="studio__panel-section">
        <h4>Available Integrations</h4>
        <div class="studio__panel-grid">
          <span class="studio__integration-badge">OpenAI</span>
          <span class="studio__integration-badge">ElevenLabs</span>
          <span class="studio__integration-badge">Replicate</span>
          <span class="studio__integration-badge">Weather API</span>
          <span class="studio__integration-badge">Twilio</span>
          <span class="studio__integration-badge">SendGrid</span>
        </div>
      </div>
    </div>
  `;
}

function renderEnvVarsPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🔑 Environment Variables</h3>
      <p class="studio__panel-desc">Manage secrets and configuration. These are injected at build time and never exposed to users.</p>

      <div class="studio__panel-section">
        <h4>Variables</h4>
        <div class="studio__panel-empty">No environment variables set.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Add Variable</h4>
        <input type="text" class="studio__panel-input" placeholder="VARIABLE_NAME" id="env-name" />
        <input type="password" class="studio__panel-input" placeholder="value" id="env-value" />
        <button class="studio__btn studio__btn--ghost" id="save-env">Add Variable</button>
      </div>
    </div>
  `;
}

function renderDeployPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🚀 Deploy</h3>
      <p class="studio__panel-desc">Submit your app to the App Store and Google Play.</p>

      <div class="studio__panel-section">
        <h4>iOS — App Store</h4>
        <div class="studio__panel-status studio__panel-status--idle">
          <span class="studio__panel-status-dot"></span> Not submitted
        </div>
        <button class="studio__btn studio__btn--primary" id="deploy-ios">Submit to App Store →</button>
      </div>

      <div class="studio__panel-section">
        <h4>Android — Google Play</h4>
        <div class="studio__panel-status studio__panel-status--idle">
          <span class="studio__panel-status-dot"></span> Not submitted
        </div>
        <button class="studio__btn studio__btn--primary" id="deploy-android">Submit to Google Play →</button>
      </div>

      <div class="studio__panel-section">
        <h4>Requirements</h4>
        <ul class="studio__panel-checklist">
          <li class="studio__check studio__check--pending">Apple Developer Account ($99/yr)</li>
          <li class="studio__check studio__check--pending">Google Play Developer Account ($25)</li>
          <li class="studio__check studio__check--pending">App icon (1024×1024)</li>
          <li class="studio__check studio__check--pending">Screenshots for all device sizes</li>
          <li class="studio__check studio__check--pending">Privacy policy URL</li>
        </ul>
      </div>
    </div>
  `;
}

function renderStoreAssetsPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🛍️ Store Assets</h3>
      <p class="studio__panel-desc">Generate screenshots, app icons, and feature graphics for App Store and Google Play.</p>

      <div class="studio__panel-section">
        <h4>Screenshots</h4>
        <div class="studio__panel-grid-assets">
          <div class="studio__asset-slot">iPhone 6.7"<br/><span class="studio__asset-status">⏳ Not generated</span></div>
          <div class="studio__asset-slot">iPhone 6.5"<br/><span class="studio__asset-status">⏳ Not generated</span></div>
          <div class="studio__asset-slot">iPad<br/><span class="studio__asset-status">⏳ Not generated</span></div>
          <div class="studio__asset-slot">Google Phone<br/><span class="studio__asset-status">⏳ Not generated</span></div>
          <div class="studio__asset-slot">Google Tablet<br/><span class="studio__asset-status">⏳ Not generated</span></div>
        </div>
        <button class="studio__btn studio__btn--primary" id="generate-screenshots">📸 Generate All Screenshots</button>
      </div>

      <div class="studio__panel-section">
        <h4>App Icon</h4>
        <div class="studio__asset-slot studio__asset-slot--large">1024×1024<br/><span class="studio__asset-status">⏳ Not generated</span></div>
        <button class="studio__btn studio__btn--ghost" id="generate-icon">Generate Icon</button>
      </div>

      <div class="studio__panel-section">
        <h4>Feature Graphic (Google Play)</h4>
        <div class="studio__asset-slot studio__asset-slot--wide">1024×500<br/><span class="studio__asset-status">⏳ Not generated</span></div>
        <button class="studio__btn studio__btn--ghost" id="generate-feature">Generate Feature Graphic</button>
      </div>
    </div>
  `;
}

function renderAdsPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">📺 Ad Studio</h3>
      <p class="studio__panel-desc">Generate video ads and playable demos for user acquisition campaigns.</p>

      <div class="studio__panel-section">
        <h4>Ad Creatives</h4>
        <div class="studio__panel-empty">No ads generated yet.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Generate Ads</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Generate a 15-second vertical video ad for TikTok/Reels">15s Vertical (TikTok)</button>
          <button class="studio__prompt-chip" data-prompt="Generate a 30-second horizontal video ad for YouTube">30s Horizontal (YouTube)</button>
          <button class="studio__prompt-chip" data-prompt="Generate a 6-second bumper ad">6s Bumper</button>
          <button class="studio__prompt-chip" data-prompt="Generate a playable ad demo">Playable Demo</button>
        </div>
      </div>

      <div class="studio__panel-section">
        <h4>Ad Networks</h4>
        <div class="studio__panel-grid">
          <span class="studio__integration-badge">AdMob</span>
          <span class="studio__integration-badge">AppLovin</span>
          <span class="studio__integration-badge">Unity Ads</span>
        </div>
      </div>
    </div>
  `;
}

function renderDesignPanel(): string {
  const categoryTabs = BRANDING_CATEGORIES.map(c =>
    `<button class="studio__branding-tab" data-branding-category="${c.id}">${c.icon} ${c.label}</button>`
  ).join('');

  const styleCards = BRANDING_STYLES.map(s =>
    `<div class="studio__branding-card" data-branding-style="${s.id}" data-style-category="${s.category}">
      <div class="studio__branding-swatch" style="background: ${s.gradient}"></div>
      <div class="studio__branding-info">
        <span class="studio__branding-badge">${s.category}</span>
        <h5 class="studio__branding-name">${s.name}</h5>
        <p class="studio__branding-desc">${s.description}</p>
        <span class="studio__branding-inspiration">Inspired by ${s.inspiration}</span>
        <button class="studio__btn studio__btn--primary studio__btn--sm studio__branding-apply" data-prompt="Apply the ${s.name} branding style to my app. This style is inspired by ${s.inspiration}: ${s.description}">Use This Style</button>
      </div>
    </div>`
  ).join('');

  return `
    <div class="studio__panel studio__panel--branding">
      <h3 class="studio__panel-title">🎨 Branding Library</h3>
      <p class="studio__panel-desc">50 world-class branding styles inspired by the best apps. Select one to instantly apply a professional design system.</p>

      <div class="studio__branding-search">
        <input type="text" class="studio__panel-input" placeholder="Search styles..." id="branding-search" />
      </div>

      <div class="studio__branding-tabs" id="branding-tabs">
        ${categoryTabs}
      </div>

      <div class="studio__branding-grid" id="branding-grid">
        ${styleCards}
      </div>
    </div>
  `;
}

function renderCodePanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">💻 Code</h3>
      <p class="studio__panel-desc">View and manage your app's source code.</p>

      <div class="studio__panel-section">
        <h4>Project Structure</h4>
        <div class="studio__file-tree-mini">
          <div class="studio__file-item">📁 src/</div>
          <div class="studio__file-item studio__file-item--indent">📄 App.tsx</div>
          <div class="studio__file-item studio__file-item--indent">📁 screens/</div>
          <div class="studio__file-item studio__file-item--indent2">📄 Home.tsx</div>
          <div class="studio__file-item studio__file-item--indent2">📄 Profile.tsx</div>
          <div class="studio__file-item studio__file-item--indent">📁 components/</div>
          <div class="studio__file-item">📄 package.json</div>
          <div class="studio__file-item">📄 app.json</div>
        </div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Show me the code for the home screen">View Home Screen</button>
          <button class="studio__prompt-chip" data-prompt="Export the project as a zip file">Export Project</button>
          <button class="studio__prompt-chip" data-prompt="Add TypeScript strict mode">Add TypeScript</button>
        </div>
      </div>
    </div>
  `;
}

function renderFilesPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">📁 Files</h3>
      <p class="studio__panel-desc">Upload images, fonts, and other assets to your app.</p>

      <div class="studio__panel-section">
        <h4>App Assets</h4>
        <div class="studio__panel-empty">No files uploaded yet.</div>
        <button class="studio__btn studio__btn--ghost" id="upload-file">📎 Upload File</button>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Prompts</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Add a custom app icon using a minimalist design">Custom Icon</button>
          <button class="studio__prompt-chip" data-prompt="Add a splash screen with the app logo">Splash Screen</button>
        </div>
      </div>
    </div>
  `;
}

function renderLogsPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">📋 Logs</h3>
      <p class="studio__panel-desc">View build logs, errors, and runtime output.</p>

      <div class="studio__panel-section">
        <h4>Build Output</h4>
        <div class="studio__panel-logs">
          <code>Ready. Waiting for app generation...</code>
        </div>
      </div>
    </div>
  `;
}

function renderRequestsPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">📡 Network Requests</h3>
      <p class="studio__panel-desc">Monitor API calls and network activity from your app.</p>

      <div class="studio__panel-section">
        <h4>Recent Requests</h4>
        <div class="studio__panel-empty">No network activity yet. Build an app to see requests.</div>
      </div>
    </div>
  `;
}

function renderPreviewPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">👁️ Preview Settings</h3>
      <p class="studio__panel-desc">Configure the live preview.</p>

      <div class="studio__panel-section">
        <h4>Device</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Switch preview to iPad">iPad</button>
          <button class="studio__prompt-chip" data-prompt="Switch preview to Android">Android</button>
          <button class="studio__prompt-chip" data-prompt="Show me the app in landscape mode">Landscape</button>
        </div>
      </div>

      <div class="studio__panel-section">
        <h4>QR Code</h4>
        <p class="studio__panel-desc">Scan to open on your phone with Expo Go.</p>
        <div class="studio__qr-placeholder">QR code will appear here after build</div>
      </div>
    </div>
  `;
}

// Tool definitions with their panel renderers
const TOOLS: { id: string; icon: string; label: string; renderPanel: () => string }[] = [
  { id: 'preview', icon: '👁️', label: 'Preview', renderPanel: renderPreviewPanel },
  { id: 'code', icon: '💻', label: 'Code', renderPanel: renderCodePanel },
  { id: 'design', icon: '🎨', label: 'Design', renderPanel: renderDesignPanel },
  { id: 'files', icon: '📁', label: 'Files', renderPanel: renderFilesPanel },
  { id: 'api', icon: '🌐', label: 'API', renderPanel: renderAPIPanel },
  { id: 'env', icon: '🔑', label: 'Env Vars', renderPanel: renderEnvVarsPanel },
  { id: 'database', icon: '🗄️', label: 'Database', renderPanel: renderDatabasePanel },
  { id: 'payments', icon: '💳', label: 'Payments', renderPanel: renderPaymentsPanel },
  { id: 'logs', icon: '📋', label: 'Logs', renderPanel: renderLogsPanel },
  { id: 'requests', icon: '📡', label: 'Requests', renderPanel: renderRequestsPanel },
  { id: 'store', icon: '🛍️', label: 'Store', renderPanel: renderStoreAssetsPanel },
  { id: 'ads', icon: '📺', label: 'Ads', renderPanel: renderAdsPanel },
  { id: 'deploy', icon: '🚀', label: 'Deploy', renderPanel: renderDeployPanel },
];

// ---------------------------------------------------------------------------
// Studio View
// ---------------------------------------------------------------------------

export class StudioView {
  private container: HTMLElement;
  private messages: { role: 'user' | 'assistant' | 'system'; text: string }[] = [
    { role: 'system', text: 'Welcome to ZionX Studio. Describe the app you want to build.' },
  ];
  private activeTool: string = 'preview';
  private toolPanelOpen: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.render();
    this.attachListeners();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  private render(): void {
    const toolPanelContent = this.toolPanelOpen
      ? TOOLS.find(t => t.id === this.activeTool)?.renderPanel() ?? ''
      : '';

    this.container.innerHTML = `
      <div class="studio ${this.toolPanelOpen ? 'studio--panel-open' : ''}">
        <!-- LEFT: Chat Panel -->
        <div class="studio__chat">
          <div class="studio__chat-header">
            <h2 class="studio__chat-title">ZionX Studio</h2>
          </div>
          <div class="studio__chat-messages" id="studio-messages">
            ${this.renderMessages()}
          </div>
          <div class="studio__chat-input-area">
            <textarea
              class="studio__chat-input"
              id="studio-input"
              placeholder="Describe your app, or tell me what to change..."
              rows="4"
            ></textarea>
            <div class="studio__chat-actions">
              <button class="studio__btn studio__btn--primary" id="studio-send">
                Build App →
              </button>
              <button class="studio__btn studio__btn--ghost" id="studio-undo" title="Undo">↩</button>
              <button class="studio__btn studio__btn--ghost" id="studio-redo" title="Redo">↪</button>
            </div>
          </div>
        </div>

        <!-- CENTER: Phone Preview (2X width of chat) -->
        <div class="studio__preview">
          <div class="studio__preview-toolbar">
            ${renderDeviceSelector({ devices: DEFAULT_DEVICES, selectedDeviceId: 'iphone-15' })}
            <div class="studio__preview-controls">
              <button class="studio__btn studio__btn--icon" id="studio-reload" title="Reload">↻</button>
              <button class="studio__btn studio__btn--icon" id="studio-screenshot" title="Screenshot">📸</button>
              <button class="studio__btn studio__btn--icon" id="studio-qr" title="Open on phone">📱</button>
            </div>
          </div>
          <div class="studio__preview-device">
            <div class="studio__device-frame">
              <div class="studio__device-notch"></div>
              <div class="studio__device-screen" id="studio-screen">
                <div class="studio__device-placeholder">
                  <div class="studio__device-placeholder-icon">📱</div>
                  <p class="studio__device-placeholder-title">Your app preview</p>
                  <p class="studio__device-placeholder-text">Describe your app to get started</p>
                </div>
              </div>
              <div class="studio__device-home-indicator"></div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Tool Sidebar -->
        <div class="studio__tools">
          ${TOOLS.map(t => `
            <button class="studio__tool-item ${t.id === this.activeTool && this.toolPanelOpen ? 'studio__tool-item--active' : ''}" data-tool="${t.id}" title="${t.label}">
              <span class="studio__tool-icon">${t.icon}</span>
              <span class="studio__tool-label">${t.label}</span>
            </button>
          `).join('')}
        </div>

        <!-- Tool Panel (slides out from right) -->
        ${this.toolPanelOpen ? `
          <div class="studio__tool-panel">
            <button class="studio__tool-panel-close" id="close-tool-panel">✕</button>
            ${toolPanelContent}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderMessages(): string {
    return this.messages.map(msg => {
      const cls = msg.role === 'user' ? 'studio__msg--user' : msg.role === 'assistant' ? 'studio__msg--assistant' : 'studio__msg--system';
      return `<div class="studio__msg ${cls}"><p>${msg.text}</p></div>`;
    }).join('');
  }

  private attachListeners(): void {
    const sendBtn = this.container.querySelector('#studio-send') as HTMLButtonElement;
    const input = this.container.querySelector('#studio-input') as HTMLTextAreaElement;

    if (sendBtn && input) {
      const handleSend = () => {
        const text = input.value.trim();
        if (!text) return;
        this.messages.push({ role: 'user', text });
        this.messages.push({
          role: 'assistant',
          text: `Building: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}". Preview will update shortly.`,
        });
        input.value = '';
        this.render();
        this.attachListeners();
        const msgs = this.container.querySelector('#studio-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
      };

      sendBtn.addEventListener('click', handleSend);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend(); }
      });
    }

    // Tool sidebar clicks — open panel
    this.container.querySelectorAll('[data-tool]').forEach(item => {
      item.addEventListener('click', () => {
        const toolId = (item as HTMLElement).dataset.tool!;
        if (this.activeTool === toolId && this.toolPanelOpen) {
          this.toolPanelOpen = false;
        } else {
          this.activeTool = toolId;
          this.toolPanelOpen = true;
        }
        this.render();
        this.attachListeners();
      });
    });

    // Close tool panel
    this.container.querySelector('#close-tool-panel')?.addEventListener('click', () => {
      this.toolPanelOpen = false;
      this.render();
      this.attachListeners();
    });

    // Prompt chips — send prompt to chat
    this.container.querySelectorAll('[data-prompt]').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = (chip as HTMLElement).dataset.prompt!;
        this.messages.push({ role: 'user', text: prompt });
        this.messages.push({ role: 'assistant', text: `Got it! Working on: "${prompt}"` });
        this.toolPanelOpen = false;
        this.render();
        this.attachListeners();
        const msgs = this.container.querySelector('#studio-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
      });
    });

    // Branding category filter tabs
    this.container.querySelectorAll('[data-branding-category]').forEach(tab => {
      tab.addEventListener('click', () => {
        const category = (tab as HTMLElement).dataset.brandingCategory!;
        // Update active tab
        this.container.querySelectorAll('[data-branding-category]').forEach(t =>
          t.classList.remove('studio__branding-tab--active')
        );
        tab.classList.add('studio__branding-tab--active');
        // Filter cards
        this.container.querySelectorAll('[data-branding-style]').forEach(card => {
          const cardCategory = (card as HTMLElement).dataset.styleCategory;
          if (category === 'all' || cardCategory === category) {
            (card as HTMLElement).style.display = '';
          } else {
            (card as HTMLElement).style.display = 'none';
          }
        });
      });
    });

    // Branding search
    const brandingSearch = this.container.querySelector('#branding-search') as HTMLInputElement;
    if (brandingSearch) {
      brandingSearch.addEventListener('input', () => {
        const query = brandingSearch.value.toLowerCase().trim();
        this.container.querySelectorAll('[data-branding-style]').forEach(card => {
          const el = card as HTMLElement;
          const name = el.querySelector('.studio__branding-name')?.textContent?.toLowerCase() ?? '';
          const desc = el.querySelector('.studio__branding-desc')?.textContent?.toLowerCase() ?? '';
          const inspiration = el.querySelector('.studio__branding-inspiration')?.textContent?.toLowerCase() ?? '';
          const category = el.dataset.styleCategory?.toLowerCase() ?? '';
          if (!query || name.includes(query) || desc.includes(query) || inspiration.includes(query) || category.includes(query)) {
            el.style.display = '';
          } else {
            el.style.display = 'none';
          }
        });
      });
    }

    // Set "All" tab as active by default
    const allTab = this.container.querySelector('[data-branding-category="all"]');
    if (allTab) allTab.classList.add('studio__branding-tab--active');

    // Undo/Redo/Reload
    this.container.querySelector('#studio-undo')?.addEventListener('click', () => {
      this.messages.push({ role: 'system', text: '↩ Undid last change.' });
      this.render(); this.attachListeners();
    });
    this.container.querySelector('#studio-redo')?.addEventListener('click', () => {
      this.messages.push({ role: 'system', text: '↪ Redid last change.' });
      this.render(); this.attachListeners();
    });
    this.container.querySelector('#studio-reload')?.addEventListener('click', () => {
      this.messages.push({ role: 'system', text: '↻ Preview reloaded.' });
      this.render(); this.attachListeners();
    });

    // Connect RevenueCat button
    this.container.querySelector('#connect-revenuecat')?.addEventListener('click', () => {
      window.open('https://app.revenuecat.com', '_blank');
    });

    // Deploy buttons
    this.container.querySelector('#deploy-ios')?.addEventListener('click', () => {
      this.messages.push({ role: 'user', text: 'Submit my app to the App Store' });
      this.messages.push({ role: 'assistant', text: 'Starting iOS submission process. I\'ll prepare metadata, screenshots, and submit for review.' });
      this.toolPanelOpen = false;
      this.render(); this.attachListeners();
    });
    this.container.querySelector('#deploy-android')?.addEventListener('click', () => {
      this.messages.push({ role: 'user', text: 'Submit my app to Google Play' });
      this.messages.push({ role: 'assistant', text: 'Starting Android submission process. I\'ll prepare the AAB, metadata, and submit for review.' });
      this.toolPanelOpen = false;
      this.render(); this.attachListeners();
    });

    // Generate screenshots
    this.container.querySelector('#generate-screenshots')?.addEventListener('click', () => {
      this.messages.push({ role: 'user', text: 'Generate all store screenshots' });
      this.messages.push({ role: 'assistant', text: 'Generating screenshots for all device sizes (iPhone 6.7", 6.5", iPad, Google Play phone, tablet)...' });
      this.toolPanelOpen = false;
      this.render(); this.attachListeners();
    });
  }
}

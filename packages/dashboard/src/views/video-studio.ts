/**
 * ZXMG Video Production Studio — Dashboard View
 *
 * Layout: Chat (1fr) | Video Preview + Timeline (2fr) | Tools (64px)
 * Same layout pattern as ZionX App Studio but for video content production.
 */

// ---------------------------------------------------------------------------
// Tool Panel Content Generators
// ---------------------------------------------------------------------------

function renderScriptPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">📋 Script Editor</h3>
      <p class="studio__panel-desc">Write and edit your video script. AI can generate or refine scripts based on your topic.</p>

      <div class="studio__panel-section">
        <h4>Scene Breakdown</h4>
        <div class="studio__panel-empty">No script loaded. Select a pipeline item or describe your video idea.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Generate a script for this video idea">Generate Script</button>
          <button class="studio__prompt-chip" data-prompt="Make the script more engaging with better hooks">Improve Hooks</button>
          <button class="studio__prompt-chip" data-prompt="Shorten the script to under 60 seconds">Shorten to 60s</button>
          <button class="studio__prompt-chip" data-prompt="Add a strong call-to-action at the end">Add CTA</button>
        </div>
      </div>
    </div>
  `;
}

function renderScenesPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🎬 Scenes</h3>
      <p class="studio__panel-desc">Manage individual scenes. Reorder, trim, replace, or regenerate any scene.</p>

      <div class="studio__panel-section">
        <h4>Scene List</h4>
        <div class="studio__panel-empty">No scenes yet. Generate a video to see scenes here.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Add a new scene after the current one">Add Scene</button>
          <button class="studio__prompt-chip" data-prompt="Regenerate the current scene with different visuals">Regenerate Scene</button>
          <button class="studio__prompt-chip" data-prompt="Split this scene into two parts">Split Scene</button>
          <button class="studio__prompt-chip" data-prompt="Remove the current scene">Delete Scene</button>
        </div>
      </div>
    </div>
  `;
}

function renderCharactersPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">👤 Characters</h3>
      <p class="studio__panel-desc">Manage AI avatars and characters for your videos.</p>

      <div class="studio__panel-section">
        <h4>AI Avatars</h4>
        <div class="studio__panel-empty">No avatars configured. Create one to use as a presenter or character.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Create a professional male presenter avatar">Male Presenter</button>
          <button class="studio__prompt-chip" data-prompt="Create a professional female presenter avatar">Female Presenter</button>
          <button class="studio__prompt-chip" data-prompt="Create an animated character avatar">Animated Character</button>
          <button class="studio__prompt-chip" data-prompt="Clone my voice for voiceover">Clone Voice</button>
        </div>
      </div>
    </div>
  `;
}

function renderAudioPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🎵 Audio</h3>
      <p class="studio__panel-desc">Manage audio layers: music, sound effects, voiceover, and ambient sounds.</p>

      <div class="studio__panel-section">
        <h4>Audio Tracks</h4>
        <div class="video-studio__audio-tracks">
          <div class="video-studio__audio-track">
            <span class="video-studio__track-icon">🎤</span>
            <span class="video-studio__track-label">Voiceover</span>
            <span class="video-studio__track-status">Empty</span>
          </div>
          <div class="video-studio__audio-track">
            <span class="video-studio__track-icon">🎵</span>
            <span class="video-studio__track-label">Background Music</span>
            <span class="video-studio__track-status">Empty</span>
          </div>
          <div class="video-studio__audio-track">
            <span class="video-studio__track-icon">💥</span>
            <span class="video-studio__track-label">Sound Effects</span>
            <span class="video-studio__track-status">Empty</span>
          </div>
          <div class="video-studio__audio-track">
            <span class="video-studio__track-icon">🌊</span>
            <span class="video-studio__track-label">Ambient</span>
            <span class="video-studio__track-status">Empty</span>
          </div>
        </div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Generate AI voiceover for the script">Generate Voiceover</button>
          <button class="studio__prompt-chip" data-prompt="Add trending background music">Add Music</button>
          <button class="studio__prompt-chip" data-prompt="Add sound effects to match scene transitions">Add SFX</button>
          <button class="studio__prompt-chip" data-prompt="Add ambient audio for atmosphere">Add Ambient</button>
        </div>
      </div>
    </div>
  `;
}

function renderEffectsPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">✨ Effects</h3>
      <p class="studio__panel-desc">Transitions, color grading, and visual effects.</p>

      <div class="studio__panel-section">
        <h4>Transitions</h4>
        <div class="studio__panel-grid">
          <span class="studio__integration-badge">Cut</span>
          <span class="studio__integration-badge">Fade</span>
          <span class="studio__integration-badge">Dissolve</span>
          <span class="studio__integration-badge">Wipe</span>
          <span class="studio__integration-badge">Zoom</span>
          <span class="studio__integration-badge">Slide</span>
        </div>
      </div>

      <div class="studio__panel-section">
        <h4>Color Grading Presets</h4>
        <div class="studio__panel-grid">
          <span class="studio__integration-badge">Cinematic</span>
          <span class="studio__integration-badge">Warm</span>
          <span class="studio__integration-badge">Cool</span>
          <span class="studio__integration-badge">Vintage</span>
          <span class="studio__integration-badge">High Contrast</span>
          <span class="studio__integration-badge">Muted</span>
        </div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Apply cinematic color grading to all scenes">Cinematic Grade</button>
          <button class="studio__prompt-chip" data-prompt="Add smooth transitions between all scenes">Auto Transitions</button>
          <button class="studio__prompt-chip" data-prompt="Add text overlays with key points">Text Overlays</button>
        </div>
      </div>
    </div>
  `;
}

function renderTrendsPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">📈 Trends</h3>
      <p class="studio__panel-desc">Trending topics, algorithm signals, and content gaps for your niche.</p>

      <div class="studio__panel-section">
        <h4>Trending Now</h4>
        <div class="studio__panel-empty">Select a channel to see trending topics in your niche.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Algorithm Signals</h4>
        <div class="studio__panel-empty">Analyzing platform algorithms for optimal posting strategy...</div>
      </div>

      <div class="studio__panel-section">
        <h4>Content Gaps</h4>
        <div class="studio__panel-empty">Identifying underserved topics in your niche...</div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Find trending topics in my niche for this week">This Week's Trends</button>
          <button class="studio__prompt-chip" data-prompt="Analyze what content gaps exist in my niche">Find Content Gaps</button>
          <button class="studio__prompt-chip" data-prompt="What video length performs best for my channel?">Optimal Length</button>
        </div>
      </div>
    </div>
  `;
}

function renderThumbnailsPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🖼️ Thumbnails</h3>
      <p class="studio__panel-desc">Generate thumbnail variants and run A/B tests to maximize CTR.</p>

      <div class="studio__panel-section">
        <h4>Generated Variants</h4>
        <div class="studio__panel-empty">No thumbnails generated yet. Generate a video first.</div>
      </div>

      <div class="studio__panel-section">
        <h4>A/B Test Results</h4>
        <div class="studio__panel-empty">No A/B tests running. Publish with multiple thumbnails to start testing.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Generate 5 thumbnail variants for this video">Generate 5 Variants</button>
          <button class="studio__prompt-chip" data-prompt="Create a thumbnail with bold text and high contrast">Bold Text Style</button>
          <button class="studio__prompt-chip" data-prompt="Create a curiosity-gap thumbnail">Curiosity Gap</button>
        </div>
      </div>
    </div>
  `;
}

function renderCaptionsPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">💬 Captions</h3>
      <p class="studio__panel-desc">Auto-generate subtitles and captions for accessibility and engagement.</p>

      <div class="studio__panel-section">
        <h4>Subtitle Status</h4>
        <div class="studio__panel-status studio__panel-status--idle">
          <span class="studio__panel-status-dot"></span> Not generated
        </div>
      </div>

      <div class="studio__panel-section">
        <h4>Style</h4>
        <div class="studio__panel-grid">
          <span class="studio__integration-badge">Standard</span>
          <span class="studio__integration-badge">Bold Highlight</span>
          <span class="studio__integration-badge">Word-by-Word</span>
          <span class="studio__integration-badge">Karaoke</span>
        </div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Generate captions from the voiceover">Auto-Generate</button>
          <button class="studio__prompt-chip" data-prompt="Apply bold highlight caption style">Bold Style</button>
          <button class="studio__prompt-chip" data-prompt="Translate captions to Spanish">Translate to Spanish</button>
        </div>
      </div>
    </div>
  `;
}

function renderExportPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">📤 Export</h3>
      <p class="studio__panel-desc">Export your video in multiple formats optimized for each platform.</p>

      <div class="studio__panel-section">
        <h4>Format Presets</h4>
        <div class="studio__panel-grid-assets">
          <div class="studio__asset-slot">16:9 Landscape<br/><span class="studio__asset-status">YouTube, Facebook</span></div>
          <div class="studio__asset-slot">9:16 Vertical<br/><span class="studio__asset-status">TikTok, Reels, Shorts</span></div>
          <div class="studio__asset-slot">1:1 Square<br/><span class="studio__asset-status">Instagram Feed, X</span></div>
        </div>
      </div>

      <div class="studio__panel-section">
        <h4>Quality</h4>
        <div class="studio__panel-grid">
          <span class="studio__integration-badge">4K (2160p)</span>
          <span class="studio__integration-badge">1080p</span>
          <span class="studio__integration-badge">720p</span>
        </div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Export in all formats (16:9, 9:16, 1:1) at 1080p">Export All Formats</button>
          <button class="studio__prompt-chip" data-prompt="Export 4K version for YouTube">4K YouTube Export</button>
          <button class="studio__prompt-chip" data-prompt="Export vertical version for TikTok and Reels">Vertical Export</button>
        </div>
      </div>
    </div>
  `;
}

function renderAnalyticsPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">📊 Analytics</h3>
      <p class="studio__panel-desc">Per-video performance metrics and audience retention heatmaps.</p>

      <div class="studio__panel-section">
        <h4>Performance Overview</h4>
        <div class="studio__panel-empty">No published videos yet. Analytics will appear after publishing.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Retention Heatmap</h4>
        <div class="studio__panel-empty">Publish a video to see where viewers drop off.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Show me retention data for my last video">Last Video Retention</button>
          <button class="studio__prompt-chip" data-prompt="What's my average view duration across all videos?">Avg View Duration</button>
          <button class="studio__prompt-chip" data-prompt="Which video had the best CTR?">Best CTR Video</button>
        </div>
      </div>
    </div>
  `;
}

function renderPublishPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🚀 Publish</h3>
      <p class="studio__panel-desc">Distribute your video across all connected platforms simultaneously.</p>

      <div class="studio__panel-section">
        <h4>Platforms</h4>
        <div class="studio__panel-grid-assets">
          <div class="studio__asset-slot">YouTube<br/><span class="studio__asset-status">⏳ Not connected</span></div>
          <div class="studio__asset-slot">TikTok<br/><span class="studio__asset-status">⏳ Not connected</span></div>
          <div class="studio__asset-slot">Instagram<br/><span class="studio__asset-status">⏳ Not connected</span></div>
          <div class="studio__asset-slot">X (Twitter)<br/><span class="studio__asset-status">⏳ Not connected</span></div>
          <div class="studio__asset-slot">Facebook<br/><span class="studio__asset-status">⏳ Not connected</span></div>
          <div class="studio__asset-slot">Rumble<br/><span class="studio__asset-status">⏳ Not connected</span></div>
        </div>
      </div>

      <div class="studio__panel-section">
        <h4>Schedule</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Publish now to all connected platforms">Publish Now</button>
          <button class="studio__prompt-chip" data-prompt="Schedule for optimal time based on audience analytics">Schedule Optimal</button>
          <button class="studio__prompt-chip" data-prompt="Schedule for tomorrow at 9am">Tomorrow 9am</button>
        </div>
      </div>
    </div>
  `;
}

function renderPipelinePanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🤖 Pipeline</h3>
      <p class="studio__panel-desc">View the autonomous content pipeline. All ideas ranked by predicted performance.</p>

      <div class="studio__panel-section">
        <h4>Pipeline Queue</h4>
        <div class="studio__panel-empty">Pipeline is idle. Ideas will appear here as ZXMG generates them.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Pipeline Settings</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Generate 10 new video ideas for my channel">Generate Ideas</button>
          <button class="studio__prompt-chip" data-prompt="Set pipeline to auto-generate 3 videos per week">Auto 3/week</button>
          <button class="studio__prompt-chip" data-prompt="Pause the autonomous pipeline">Pause Pipeline</button>
        </div>
      </div>
    </div>
  `;
}

function renderResearchPanel(): string {
  return `
    <div class="studio__panel">
      <h3 class="studio__panel-title">🔬 Research</h3>
      <p class="studio__panel-desc">Competitor analysis, viral patterns, and content research tools.</p>

      <div class="studio__panel-section">
        <h4>Competitor Analysis</h4>
        <div class="studio__panel-empty">Add competitor channels to track their content strategy.</div>
      </div>

      <div class="studio__panel-section">
        <h4>Viral Patterns</h4>
        <div class="studio__panel-empty">Analyzing viral content patterns in your niche...</div>
      </div>

      <div class="studio__panel-section">
        <h4>Quick Actions</h4>
        <div class="studio__panel-prompts">
          <button class="studio__prompt-chip" data-prompt="Analyze my top 3 competitors' recent videos">Competitor Analysis</button>
          <button class="studio__prompt-chip" data-prompt="What viral patterns are working in my niche right now?">Viral Patterns</button>
          <button class="studio__prompt-chip" data-prompt="Find underperforming topics I could do better">Content Opportunities</button>
          <button class="studio__prompt-chip" data-prompt="What hooks are getting the most engagement?">Top Hooks</button>
        </div>
      </div>
    </div>
  `;
}

// Tool definitions with their panel renderers
const VIDEO_TOOLS: { id: string; icon: string; label: string; renderPanel: () => string }[] = [
  { id: 'script', icon: '📋', label: 'Script', renderPanel: renderScriptPanel },
  { id: 'scenes', icon: '🎬', label: 'Scenes', renderPanel: renderScenesPanel },
  { id: 'characters', icon: '👤', label: 'Characters', renderPanel: renderCharactersPanel },
  { id: 'audio', icon: '🎵', label: 'Audio', renderPanel: renderAudioPanel },
  { id: 'effects', icon: '✨', label: 'Effects', renderPanel: renderEffectsPanel },
  { id: 'trends', icon: '📈', label: 'Trends', renderPanel: renderTrendsPanel },
  { id: 'thumbnails', icon: '🖼️', label: 'Thumbnails', renderPanel: renderThumbnailsPanel },
  { id: 'captions', icon: '💬', label: 'Captions', renderPanel: renderCaptionsPanel },
  { id: 'export', icon: '📤', label: 'Export', renderPanel: renderExportPanel },
  { id: 'analytics', icon: '📊', label: 'Analytics', renderPanel: renderAnalyticsPanel },
  { id: 'publish', icon: '🚀', label: 'Publish', renderPanel: renderPublishPanel },
  { id: 'pipeline', icon: '🤖', label: 'Pipeline', renderPanel: renderPipelinePanel },
  { id: 'research', icon: '🔬', label: 'Research', renderPanel: renderResearchPanel },
];

// ---------------------------------------------------------------------------
// Sample Pipeline Data
// ---------------------------------------------------------------------------

interface PipelineItem {
  id: string;
  title: string;
  predictedViews: string;
  status: 'ideated' | 'generating' | 'generated' | 'ready_to_publish' | 'published';
}

const SAMPLE_PIPELINE: PipelineItem[] = [
  { id: '1', title: '10 AI Tools That Will Replace Your Job in 2025', predictedViews: '250K', status: 'ready_to_publish' },
  { id: '2', title: 'I Built an App in 24 Hours Using Only AI', predictedViews: '180K', status: 'generated' },
  { id: '3', title: 'The Algorithm Hack Nobody Talks About', predictedViews: '320K', status: 'ideated' },
  { id: '4', title: 'Why 99% of YouTube Channels Fail', predictedViews: '150K', status: 'ideated' },
  { id: '5', title: 'How I Automated My Entire Content Pipeline', predictedViews: '95K', status: 'generating' },
];

const CHANNELS = [
  { id: 'tech-main', name: 'TechVision (Main)', platform: 'YouTube', subs: '125K' },
  { id: 'shorts', name: 'TechVision Shorts', platform: 'TikTok', subs: '45K' },
  { id: 'podcast', name: 'Deep Dive Podcast', platform: 'YouTube', subs: '32K' },
];

// ---------------------------------------------------------------------------
// Video Studio View
// ---------------------------------------------------------------------------

export class VideoStudioView {
  private container: HTMLElement;
  private messages: { role: 'user' | 'assistant' | 'system'; text: string }[] = [
    { role: 'system', text: 'Welcome to ZXMG Video Studio. Describe a video idea or select one from the pipeline.' },
  ];
  private activeTool: string = 'script';
  private toolPanelOpen: boolean = false;
  private selectedChannel: string = CHANNELS[0].id;
  private pipelineItems: PipelineItem[] = [...SAMPLE_PIPELINE];

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

  private getStatusBadgeClass(status: PipelineItem['status']): string {
    switch (status) {
      case 'ideated': return 'video-studio__status--ideated';
      case 'generating': return 'video-studio__status--generating';
      case 'generated': return 'video-studio__status--generated';
      case 'ready_to_publish': return 'video-studio__status--ready';
      case 'published': return 'video-studio__status--published';
      default: return '';
    }
  }

  private getStatusLabel(status: PipelineItem['status']): string {
    switch (status) {
      case 'ideated': return 'Ideated';
      case 'generating': return 'Generating...';
      case 'generated': return 'Generated';
      case 'ready_to_publish': return 'Ready to Publish';
      case 'published': return 'Published';
      default: return status;
    }
  }

  private renderPipelineItems(): string {
    return this.pipelineItems.map(item => `
      <div class="video-studio__pipeline-item" data-pipeline-id="${item.id}">
        <div class="video-studio__pipeline-item-header">
          <span class="video-studio__pipeline-item-title">${item.title}</span>
          <span class="video-studio__pipeline-item-views">📊 ${item.predictedViews} predicted</span>
        </div>
        <div class="video-studio__pipeline-item-footer">
          <span class="video-studio__pipeline-item-status ${this.getStatusBadgeClass(item.status)}">${this.getStatusLabel(item.status)}</span>
          ${item.status === 'ideated' ? `<button class="studio__btn studio__btn--primary studio__btn--sm" data-generate="${item.id}">Generate</button>` : ''}
          ${item.status === 'ready_to_publish' ? `<button class="studio__btn studio__btn--primary studio__btn--sm" data-publish="${item.id}">Publish</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  private render(): void {
    const toolPanelContent = this.toolPanelOpen
      ? VIDEO_TOOLS.find(t => t.id === this.activeTool)?.renderPanel() ?? ''
      : '';

    const channelOptions = CHANNELS.map(ch =>
      `<option value="${ch.id}" ${ch.id === this.selectedChannel ? 'selected' : ''}>${ch.name} (${ch.platform} · ${ch.subs})</option>`
    ).join('');

    this.container.innerHTML = `
      <div class="studio video-studio ${this.toolPanelOpen ? 'studio--panel-open' : ''}">
        <!-- LEFT: Chat + Pipeline Panel -->
        <div class="studio__chat">
          <div class="studio__chat-header">
            <h2 class="studio__chat-title">ZXMG Video Studio</h2>
            <div class="video-studio__channel-selector">
              <label for="channel-select">Channel:</label>
              <select id="channel-select" class="video-studio__channel-select">
                ${channelOptions}
              </select>
            </div>
          </div>
          <div class="video-studio__pipeline-list" id="pipeline-list">
            ${this.renderPipelineItems()}
          </div>
          <div class="studio__chat-messages" id="studio-messages">
            ${this.renderMessages()}
          </div>
          <div class="studio__chat-input-area">
            <textarea
              class="studio__chat-input"
              id="studio-input"
              placeholder="Describe a video idea, or ask ZXMG to generate content..."
              rows="3"
            ></textarea>
            <div class="studio__chat-actions">
              <button class="studio__btn studio__btn--primary" id="studio-send">
                Create Video →
              </button>
            </div>
          </div>
        </div>

        <!-- CENTER: Video Preview + Timeline -->
        <div class="studio__preview">
          <div class="video-studio__player" id="video-player">
            <div class="video-studio__player-placeholder">
              <div class="video-studio__player-icon">▶</div>
              <p class="video-studio__player-title">Video Preview</p>
              <p class="video-studio__player-text">Select a pipeline item or generate a new video</p>
            </div>
          </div>
          <div class="video-studio__timeline" id="video-timeline">
            <div class="video-studio__timeline-empty">
              <span>Scene timeline will appear here after generation</span>
            </div>
          </div>
        </div>

        <!-- RIGHT: Tool Sidebar -->
        <div class="studio__tools">
          ${VIDEO_TOOLS.map(t => `
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
          text: `Generating video concept: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}". Analyzing trends and scripting...`,
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

    // Channel selector
    const channelSelect = this.container.querySelector('#channel-select') as HTMLSelectElement;
    if (channelSelect) {
      channelSelect.addEventListener('change', () => {
        this.selectedChannel = channelSelect.value;
        const channel = CHANNELS.find(c => c.id === this.selectedChannel);
        this.messages.push({ role: 'system', text: `Switched to channel: ${channel?.name ?? this.selectedChannel}` });
        this.render();
        this.attachListeners();
      });
    }

    // Generate buttons
    this.container.querySelectorAll('[data-generate]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.generate!;
        const item = this.pipelineItems.find(p => p.id === id);
        if (item) {
          item.status = 'generating';
          this.messages.push({ role: 'assistant', text: `Generating video: "${item.title}"...` });
          this.render();
          this.attachListeners();
        }
      });
    });

    // Publish buttons
    this.container.querySelectorAll('[data-publish]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.publish!;
        const item = this.pipelineItems.find(p => p.id === id);
        if (item) {
          item.status = 'published';
          this.messages.push({ role: 'assistant', text: `Published: "${item.title}" to all connected platforms.` });
          this.render();
          this.attachListeners();
        }
      });
    });

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
        this.messages.push({ role: 'assistant', text: `Working on: "${prompt}"` });
        this.toolPanelOpen = false;
        this.render();
        this.attachListeners();
        const msgs = this.container.querySelector('#studio-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
      });
    });
  }
}

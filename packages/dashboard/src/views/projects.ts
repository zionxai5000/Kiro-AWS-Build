/**
 * ProjectsView — read-only gallery of every app the operator has generated.
 *
 * Sibling tab to Studio. Lists all projects (persisted via S3 mirror), each
 * with name, file count, last-updated timestamp, and two actions:
 *   - Preview  → opens a Snack embed iframe for that project
 *   - Edit     → opens Studio with the project pre-selected
 *
 * Why a separate view: King wants completed apps somewhere they can be
 * browsed and revisited without scrolling the Studio sidebar. This is the
 * "Projects" tab he asked for.
 */

import { listAppDevProjects, createPreview, type AppDevProjectListEntry } from '../api.js';

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const sec = Math.round(diffMs / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    if (day < 30) return `${day}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

interface ProjectsState {
  loading: boolean;
  error: string | null;
  projects: AppDevProjectListEntry[];
  previewing: { projectId: string; url: string } | null;
}

export class ProjectsView {
  private container: HTMLElement;
  private state: ProjectsState = {
    loading: true,
    error: null,
    projects: [],
    previewing: null,
  };

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async mount(): Promise<void> {
    this.injectStyles();
    this.render();
    await this.loadProjects();
  }

  unmount(): void {
    this.container.innerHTML = '';
  }

  /**
   * Inject view-scoped CSS once. We don't have a global stylesheet for
   * dashboard views (most use inline styles); a small <style> tag with a
   * stable id keeps it idempotent across mounts.
   */
  private injectStyles(): void {
    if (document.getElementById('projects-view-styles')) return;
    const style = document.createElement('style');
    style.id = 'projects-view-styles';
    style.textContent = `
      .projects-page {
        padding: 28px 32px 80px;
        max-width: 1400px;
        margin: 0 auto;
        color: #e6e6e6;
      }
      .projects-page__head {
        display: flex;
        align-items: baseline;
        gap: 16px;
        margin-bottom: 4px;
      }
      .projects-page__title {
        font-size: 28px;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin: 0;
      }
      .projects-page__count {
        font-size: 13px;
        opacity: 0.6;
      }
      .projects-page__sub {
        font-size: 13px;
        color: #a8aab2;
        margin-bottom: 24px;
      }
      .projects-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
      }
      .project-card {
        background: linear-gradient(180deg, #14171f 0%, #11141b 100%);
        border: 1px solid #232735;
        border-radius: 14px;
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        transition: transform 160ms ease-out, border-color 160ms ease-out;
      }
      .project-card:hover {
        transform: translateY(-2px);
        border-color: #3a4054;
      }
      .project-card__header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
      }
      .project-card__name {
        font-size: 16px;
        font-weight: 600;
        line-height: 1.3;
      }
      .project-card__saved {
        font-size: 10px;
        padding: 3px 8px;
        border-radius: 8px;
        background: rgba(52, 211, 153, 0.12);
        color: rgb(52, 211, 153);
        white-space: nowrap;
      }
      .project-card__prompt {
        font-size: 12px;
        color: #9098a8;
        line-height: 1.4;
        font-style: italic;
      }
      .project-card__meta {
        font-size: 11px;
        color: #7c8294;
        display: flex;
        gap: 6px;
      }
      .project-card__actions {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }
      .project-card__btn {
        flex: 1;
        padding: 9px 12px;
        font-size: 12px;
        font-weight: 600;
        background: #1d2030;
        color: #e6e6e6;
        border: 1px solid #2a2f3d;
        border-radius: 8px;
        cursor: pointer;
        transition: background 140ms ease-out, transform 140ms ease-out;
      }
      .project-card__btn:hover {
        background: #2a2f43;
      }
      .project-card__btn:active {
        transform: scale(0.97);
      }
      .project-card__btn--primary {
        background: linear-gradient(180deg, #6c8cff 0%, #4a6dff 100%);
        color: #fff;
        border-color: transparent;
      }
      .project-card__btn--primary:hover {
        background: linear-gradient(180deg, #7c9cff 0%, #5a7dff 100%);
      }
      .projects-empty {
        text-align: center;
        padding: 80px 20px;
        opacity: 0.85;
      }
      .projects-empty__icon {
        font-size: 56px;
        margin-bottom: 12px;
      }
      .projects-empty h2 {
        font-size: 20px;
        margin: 0 0 6px;
      }
      .projects-empty p {
        font-size: 13px;
        color: #a8aab2;
      }
      .projects-cta {
        display: inline-block;
        margin-top: 16px;
        padding: 10px 20px;
        background: linear-gradient(180deg, #6c8cff 0%, #4a6dff 100%);
        color: #fff;
        border-radius: 10px;
        text-decoration: none;
        font-weight: 600;
        font-size: 13px;
      }
      .projects-loading,
      .projects-error {
        padding: 40px;
        text-align: center;
        color: #9098a8;
      }
      .projects-error {
        color: #ff7a7a;
      }
      .projects-modal {
        position: fixed;
        inset: 0;
        background: rgba(7, 9, 15, 0.78);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 24px;
      }
      .projects-modal__pane {
        width: min(900px, 95vw);
        height: min(800px, 90vh);
        background: #14171f;
        border: 1px solid #2a2f3d;
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .projects-modal__head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 18px;
        border-bottom: 1px solid #1d2030;
      }
      .projects-modal__head h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }
      .projects-modal__close {
        background: transparent;
        border: 0;
        color: #a8aab2;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 10px;
        border-radius: 8px;
      }
      .projects-modal__close:hover {
        background: #1d2030;
        color: #fff;
      }
      .projects-modal__iframe {
        flex: 1;
        width: 100%;
        border: 0;
        background: #0f1115;
      }
    `;
    document.head.appendChild(style);
  }

  private async loadProjects(): Promise<void> {
    try {
      const result = await listAppDevProjects();
      this.state.projects = result.projects;
      this.state.loading = false;
      this.state.error = null;
    } catch (err) {
      this.state.error = (err as Error).message ?? 'Failed to load projects';
      this.state.loading = false;
    }
    this.render();
  }

  private async openPreview(projectId: string): Promise<void> {
    try {
      const preview = await createPreview(projectId);
      this.state.previewing = { projectId, url: preview.embedUrl ?? preview.url };
      this.render();
    } catch (err) {
      this.state.error = `Could not open preview: ${(err as Error).message}`;
      this.render();
    }
  }

  private closePreview(): void {
    this.state.previewing = null;
    this.render();
  }

  private editProject(projectId: string): void {
    // Persist selection so Studio picks it up on mount.
    try {
      localStorage.setItem('zionx.appdev.lastProject', projectId);
    } catch {
      /* localStorage unavailable in some test envs */
    }
    // Navigate via the dashboard's hash-style route by clicking the nav link.
    const link = document.querySelector<HTMLAnchorElement>('a[data-view="zionx-app-development"]');
    link?.click();
  }

  private render(): void {
    if (this.state.loading) {
      this.container.innerHTML = `
        <div class="projects-page">
          <h1 class="projects-page__title">📦 Projects</h1>
          <div class="projects-loading">Loading projects from S3 mirror...</div>
        </div>
      `;
      return;
    }

    if (this.state.error && !this.state.projects.length) {
      this.container.innerHTML = `
        <div class="projects-page">
          <h1 class="projects-page__title">📦 Projects</h1>
          <div class="projects-error">${escapeHtml(this.state.error)}</div>
        </div>
      `;
      this.attachListeners();
      return;
    }

    if (this.state.projects.length === 0) {
      this.container.innerHTML = `
        <div class="projects-page">
          <h1 class="projects-page__title">📦 Projects</h1>
          <div class="projects-empty">
            <div class="projects-empty__icon">🎨</div>
            <h2>No projects yet</h2>
            <p>Head to <strong>App Development</strong> and send your first prompt to get started.</p>
            <a href="#" class="projects-cta" data-action="goto-studio">Open Studio →</a>
          </div>
        </div>
      `;
      this.attachListeners();
      return;
    }

    const cards = this.state.projects
      .map((p) => `
        <div class="project-card" data-project-id="${escapeHtml(p.projectId)}">
          <div class="project-card__header">
            <div class="project-card__name">${escapeHtml(p.name ?? p.projectId)}</div>
            <span class="project-card__saved" title="Persisted to S3">💾 Saved</span>
          </div>
          ${p.prompt ? `<div class="project-card__prompt">${escapeHtml(p.prompt.slice(0, 140))}${p.prompt.length > 140 ? '…' : ''}</div>` : ''}
          <div class="project-card__meta">
            <span>${p.fileCount} files</span>
            <span>·</span>
            <span>Updated ${escapeHtml(fmtTime(p.updatedAt ?? p.createdAt))}</span>
          </div>
          <div class="project-card__actions">
            <button class="project-card__btn project-card__btn--primary" data-action="preview" data-project-id="${escapeHtml(p.projectId)}">
              👁 Preview
            </button>
            <button class="project-card__btn" data-action="edit" data-project-id="${escapeHtml(p.projectId)}">
              ✏️ Edit
            </button>
          </div>
        </div>
      `)
      .join('');

    this.container.innerHTML = `
      <div class="projects-page">
        <div class="projects-page__head">
          <h1 class="projects-page__title">📦 Projects</h1>
          <div class="projects-page__count">${this.state.projects.length} project${this.state.projects.length === 1 ? '' : 's'}</div>
        </div>
        <div class="projects-page__sub">All apps you've generated. Saved to S3, survives container restarts.</div>
        <div class="projects-grid">${cards}</div>
        ${this.state.previewing ? this.renderPreviewModal() : ''}
      </div>
    `;
    this.attachListeners();
  }

  private renderPreviewModal(): string {
    const previewing = this.state.previewing;
    if (!previewing) return '';
    return `
      <div class="projects-modal" data-action="close-preview">
        <div class="projects-modal__pane" data-stop-propagation>
          <div class="projects-modal__head">
            <h3>${escapeHtml(this.state.projects.find((p) => p.projectId === previewing.projectId)?.name ?? previewing.projectId)}</h3>
            <button class="projects-modal__close" data-action="close-preview">✕</button>
          </div>
          <iframe class="projects-modal__iframe" src="${escapeHtml(previewing.url)}" allow="clipboard-write" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
        </div>
      </div>
    `;
  }

  private attachListeners(): void {
    this.container.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const action = el.getAttribute('data-action');
        const projectId = el.getAttribute('data-project-id');
        if (action === 'goto-studio') {
          e.preventDefault();
          const link = document.querySelector<HTMLAnchorElement>('a[data-view="zionx-app-development"]');
          link?.click();
        } else if (action === 'preview' && projectId) {
          void this.openPreview(projectId);
        } else if (action === 'edit' && projectId) {
          this.editProject(projectId);
        } else if (action === 'close-preview') {
          // Don't close when clicking inside the pane.
          if (el.hasAttribute('data-stop-propagation')) return;
          this.closePreview();
        }
      });
    });
    // Stop propagation on the pane.
    this.container.querySelectorAll<HTMLElement>('[data-stop-propagation]').forEach((el) => {
      el.addEventListener('click', (e) => e.stopPropagation());
    });
  }
}

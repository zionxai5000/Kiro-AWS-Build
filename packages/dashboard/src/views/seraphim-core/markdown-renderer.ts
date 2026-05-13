/**
 * Shaar Dashboard — Markdown Renderer
 *
 * Renders raw markdown strings into styled HTML using:
 * - `marked` for markdown → HTML parsing
 * - `highlight.js` for code block syntax highlighting
 * - `mermaid` for mermaid diagram block rendering
 *
 * Applies dashboard-consistent styling: headings, lists, tables (striped),
 * bold, code blocks (rounded with copy button). Content is constrained
 * to max 900px centered in available space.
 *
 * Requirements: 47e.20, 47f.23, 47g.26, 47j.40
 */

import { marked, type MarkedOptions, type TokenizerAndRendererExtension } from 'marked';
import hljs from 'highlight.js';
import mermaid from 'mermaid';

/**
 * Configuration options for the MarkdownRenderer.
 */
export interface MarkdownRendererOptions {
  /** Maximum content width in pixels. Defaults to 900. */
  maxWidth?: number;
  /** Whether to enable mermaid diagram rendering. Defaults to true. */
  enableMermaid?: boolean;
  /** Whether to enable syntax highlighting. Defaults to true. */
  enableHighlight?: boolean;
}

/**
 * MarkdownRenderer converts raw markdown strings into styled HTML
 * suitable for display in the Shaar dashboard.
 */
export class MarkdownRenderer {
  private options: Required<MarkdownRendererOptions>;
  private mermaidInitialized = false;
  private mermaidCounter = 0;

  constructor(options: MarkdownRendererOptions = {}) {
    this.options = {
      maxWidth: options.maxWidth ?? 900,
      enableMermaid: options.enableMermaid ?? true,
      enableHighlight: options.enableHighlight ?? true,
    };

    this.configureMermaid();
  }

  /**
   * Render a raw markdown string into styled HTML.
   * Mermaid code blocks are detected and rendered as SVG diagrams.
   *
   * @param markdown - Raw markdown string
   * @returns Rendered HTML string wrapped in a styled container
   */
  async render(markdown: string): Promise<string> {
    const mermaidBlocks: Map<string, string> = new Map();
    let mermaidIndex = 0;

    // Pre-process: extract mermaid blocks and replace with placeholders
    const preprocessed = this.options.enableMermaid
      ? markdown.replace(/```mermaid\n([\s\S]*?)```/g, (_match, code: string) => {
          const placeholder = `<!--mermaid-placeholder-${mermaidIndex}-->`;
          mermaidBlocks.set(placeholder, code.trim());
          mermaidIndex++;
          return placeholder;
        })
      : markdown;

    // Configure marked with highlight.js integration
    const markedOptions: MarkedOptions = {
      gfm: true,
      breaks: false,
    };

    // Set up a custom renderer for code blocks with syntax highlighting and copy button
    const renderer = new marked.Renderer();

    renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
      let highlighted: string;
      if (this.options.enableHighlight && lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(text, { language: lang }).value;
      } else if (this.options.enableHighlight) {
        highlighted = hljs.highlightAuto(text).value;
      } else {
        highlighted = this.escapeHtml(text);
      }

      const langLabel = lang ? `<span class="md-code-lang">${this.escapeHtml(lang)}</span>` : '';

      return `<div class="md-code-block">
  <div class="md-code-header">
    ${langLabel}
    <button class="md-copy-btn" aria-label="Copy code to clipboard" data-code="${this.escapeAttr(text)}">Copy</button>
  </div>
  <pre class="md-pre"><code class="md-code hljs${lang ? ` language-${this.escapeHtml(lang)}` : ''}">${highlighted}</code></pre>
</div>`;
    };

    renderer.table = ({ header, rows }: { header: string; rows: string[] }) => {
      return `<div class="md-table-wrapper">
  <table class="md-table">
    <thead>${header}</thead>
    <tbody>${rows.join('')}</tbody>
  </table>
</div>`;
    };

    marked.setOptions(markedOptions);
    marked.use({ renderer });

    // Parse markdown to HTML
    let html = await marked.parse(preprocessed);

    // Post-process: render mermaid blocks
    if (this.options.enableMermaid && mermaidBlocks.size > 0) {
      for (const [placeholder, code] of mermaidBlocks) {
        const svgHtml = await this.renderMermaid(code);
        html = html.replace(placeholder, svgHtml);
      }
    }

    // Wrap in styled container
    return this.wrapInContainer(html);
  }

  /**
   * Get the CSS styles for the markdown renderer.
   * Can be injected into the page or used in a <style> tag.
   */
  getStyles(): string {
    return MARKDOWN_STYLES;
  }

  /**
   * Initialize the copy button event listeners on a container element.
   * Call this after inserting the rendered HTML into the DOM.
   */
  attachCopyHandlers(container: HTMLElement): void {
    const buttons = container.querySelectorAll<HTMLButtonElement>('.md-copy-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-code') ?? '';
        navigator.clipboard.writeText(code).then(() => {
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          btn.classList.add('md-copy-btn--copied');
          setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove('md-copy-btn--copied');
          }, 2000);
        });
      });
    });
  }

  private configureMermaid(): void {
    if (!this.mermaidInitialized && this.options.enableMermaid) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
      });
      this.mermaidInitialized = true;
    }
  }

  private async renderMermaid(code: string): Promise<string> {
    try {
      const id = `mermaid-diagram-${this.mermaidCounter++}`;
      const { svg } = await mermaid.render(id, code);
      return `<div class="md-mermaid-block" role="figure" aria-label="Mermaid diagram">${svg}</div>`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return `<div class="md-mermaid-error" role="alert">
  <p>Failed to render diagram</p>
  <pre><code>${this.escapeHtml(code)}</code></pre>
  <p class="md-mermaid-error-detail">${this.escapeHtml(errorMessage)}</p>
</div>`;
    }
  }

  private wrapInContainer(html: string): string {
    return `<div class="md-container" style="max-width: ${this.options.maxWidth}px; margin: 0 auto;">${html}</div>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private escapeAttr(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '&#10;')
      .replace(/\r/g, '&#13;');
  }
}

/**
 * CSS styles for the markdown renderer.
 * Provides dashboard-consistent styling for all markdown elements.
 */
export const MARKDOWN_STYLES = `
.md-container {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.7;
  color: #E2E8F0;
  padding: 1.5rem;
}

/* Headings */
.md-container h1 {
  font-size: 2rem;
  font-weight: 700;
  margin: 2rem 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #334155;
  color: #F8FAFC;
}

.md-container h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 1.75rem 0 0.75rem;
  color: #F1F5F9;
}

.md-container h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 1.5rem 0 0.5rem;
  color: #F1F5F9;
}

.md-container h4,
.md-container h5,
.md-container h6 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 1.25rem 0 0.5rem;
  color: #E2E8F0;
}

/* Paragraphs */
.md-container p {
  margin: 0.75rem 0;
}

/* Bold */
.md-container strong {
  font-weight: 700;
  color: #F8FAFC;
}

/* Lists */
.md-container ul,
.md-container ol {
  margin: 0.75rem 0;
  padding-left: 1.5rem;
}

.md-container li {
  margin: 0.25rem 0;
}

.md-container li > ul,
.md-container li > ol {
  margin: 0.25rem 0;
}

/* Tables (striped) */
.md-table-wrapper {
  overflow-x: auto;
  margin: 1rem 0;
  border-radius: 8px;
  border: 1px solid #334155;
}

.md-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.md-table th {
  background: #1E293B;
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  color: #F1F5F9;
  border-bottom: 2px solid #334155;
}

.md-table td {
  padding: 0.6rem 1rem;
  border-bottom: 1px solid #1E293B;
  color: #CBD5E1;
}

.md-table tbody tr:nth-child(even) {
  background: #1E293B;
}

.md-table tbody tr:nth-child(odd) {
  background: #0F172A;
}

.md-table tbody tr:hover {
  background: #334155;
}

/* Code blocks */
.md-code-block {
  margin: 1rem 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #334155;
  background: #0F172A;
}

.md-code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: #1E293B;
  border-bottom: 1px solid #334155;
}

.md-code-lang {
  font-size: 0.75rem;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.md-copy-btn {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid #475569;
  border-radius: 4px;
  background: transparent;
  color: #94A3B8;
  cursor: pointer;
  transition: all 0.15s ease;
}

.md-copy-btn:hover {
  background: #334155;
  color: #E2E8F0;
}

.md-copy-btn--copied {
  border-color: #10B981;
  color: #10B981;
}

.md-pre {
  margin: 0;
  padding: 1rem;
  overflow-x: auto;
}

.md-code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
}

/* Inline code */
.md-container code:not(.md-code) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85em;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  background: #1E293B;
  color: #E879F9;
}

/* Blockquotes */
.md-container blockquote {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border-left: 4px solid #7C3AED;
  background: #1E293B;
  border-radius: 0 8px 8px 0;
}

.md-container blockquote p {
  margin: 0.25rem 0;
}

/* Horizontal rules */
.md-container hr {
  border: none;
  border-top: 1px solid #334155;
  margin: 2rem 0;
}

/* Links */
.md-container a {
  color: #60A5FA;
  text-decoration: none;
}

.md-container a:hover {
  text-decoration: underline;
}

/* Mermaid diagrams */
.md-mermaid-block {
  margin: 1.5rem 0;
  padding: 1rem;
  background: #1E293B;
  border-radius: 8px;
  border: 1px solid #334155;
  text-align: center;
  overflow-x: auto;
}

.md-mermaid-error {
  margin: 1rem 0;
  padding: 1rem;
  background: #1C1917;
  border: 1px solid #DC2626;
  border-radius: 8px;
  color: #FCA5A5;
}

.md-mermaid-error-detail {
  font-size: 0.8rem;
  color: #94A3B8;
  margin-top: 0.5rem;
}

/* Images */
.md-container img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}
`;

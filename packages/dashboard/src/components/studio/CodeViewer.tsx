/**
 * ZionX App Development Studio — Code Viewer Component
 *
 * Syntax-highlighted file viewer (read-only MVP). Accepts file content
 * and language, renders with line numbers.
 *
 * Requirements: 42c.8, 42c.9
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeViewerProps {
  content: string;
  language: string;
  filePath?: string;
  highlightLines?: number[];
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderLine(
  lineContent: string,
  lineNumber: number,
  isHighlighted: boolean,
): string {
  return `
    <tr class="code-viewer__line ${isHighlighted ? 'code-viewer__line--highlighted' : ''}"
        data-line="${lineNumber}">
      <td class="code-viewer__line-number">${lineNumber}</td>
      <td class="code-viewer__line-content"><code>${escapeHtml(lineContent)}</code></td>
    </tr>
  `;
}

// ---------------------------------------------------------------------------
// Main Render
// ---------------------------------------------------------------------------

/**
 * Renders the code viewer as an HTML string with line numbers.
 */
export function renderCodeViewer(props: CodeViewerProps): string {
  const lines = props.content.split('\n');
  const highlightSet = new Set(props.highlightLines ?? []);

  const linesHtml = lines
    .map((line, index) => renderLine(line, index + 1, highlightSet.has(index + 1)))
    .join('');

  const header = props.filePath
    ? `<div class="code-viewer__header">
        <span class="code-viewer__file-path">${escapeHtml(props.filePath)}</span>
        <span class="code-viewer__language">${escapeHtml(props.language)}</span>
      </div>`
    : '';

  return `
    <div class="studio-code-viewer" data-language="${escapeHtml(props.language)}">
      ${header}
      <div class="code-viewer__body">
        <table class="code-viewer__table">
          <tbody>
            ${linesHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Creates a DOM element for the code viewer.
 */
export function createCodeViewerElement(props: CodeViewerProps): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderCodeViewer(props);
  return container.firstElementChild as HTMLElement;
}

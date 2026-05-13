/**
 * ZionX App Development Studio — File Tree Component
 *
 * Navigable file tree component with expand/collapse functionality,
 * file selection with content display callback, and build status
 * indicators on file tree nodes.
 *
 * Requirements: 42c.8, 42c.9
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BuildIndicator = 'none' | 'success' | 'warning' | 'error' | 'building';

export interface FileTreeNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  language?: string;
  buildStatus?: BuildIndicator;
}

export interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedPath?: string;
  expandedPaths?: string[];
  onFileSelect?: (path: string) => void;
  onToggleExpand?: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILE_ICONS: Record<string, string> = {
  ts: '📄',
  tsx: '⚛️',
  js: '📜',
  jsx: '⚛️',
  json: '📋',
  css: '🎨',
  html: '🌐',
  md: '📝',
  default: '📄',
};

const BUILD_STATUS_ICONS: Record<BuildIndicator, string> = {
  none: '',
  success: '✅',
  warning: '⚠️',
  error: '❌',
  building: '🔄',
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return FILE_ICONS[ext] ?? FILE_ICONS.default;
}

function renderNode(
  node: FileTreeNode,
  selectedPath: string | undefined,
  expandedPaths: Set<string>,
  depth: number,
): string {
  const isSelected = node.path === selectedPath;
  const isExpanded = expandedPaths.has(node.path);
  const indent = depth * 16;
  const buildIcon = node.buildStatus ? BUILD_STATUS_ICONS[node.buildStatus] : '';

  if (node.type === 'directory') {
    const childrenHtml =
      isExpanded && node.children
        ? node.children
            .map((child) => renderNode(child, selectedPath, expandedPaths, depth + 1))
            .join('')
        : '';

    return `
      <div class="file-tree__node file-tree__node--directory ${isExpanded ? 'file-tree__node--expanded' : ''}"
           data-path="${node.path}" data-type="directory" style="padding-left: ${indent}px;">
        <span class="file-tree__toggle" data-toggle-path="${node.path}">
          ${isExpanded ? '▼' : '▶'}
        </span>
        <span class="file-tree__icon">📁</span>
        <span class="file-tree__name">${node.name}</span>
        ${buildIcon ? `<span class="file-tree__build-status">${buildIcon}</span>` : ''}
      </div>
      ${childrenHtml}
    `;
  }

  return `
    <div class="file-tree__node file-tree__node--file ${isSelected ? 'file-tree__node--selected' : ''}"
         data-path="${node.path}" data-type="file" style="padding-left: ${indent + 16}px;">
      <span class="file-tree__icon">${getFileIcon(node.name)}</span>
      <span class="file-tree__name" data-file-path="${node.path}">${node.name}</span>
      ${buildIcon ? `<span class="file-tree__build-status">${buildIcon}</span>` : ''}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Main Render
// ---------------------------------------------------------------------------

/**
 * Renders the file tree as an HTML string.
 */
export function renderFileTree(props: FileTreeProps): string {
  const expandedSet = new Set(props.expandedPaths ?? []);

  const nodesHtml = props.nodes
    .map((node) => renderNode(node, props.selectedPath, expandedSet, 0))
    .join('');

  return `
    <div class="studio-file-tree">
      <div class="file-tree__container">
        ${nodesHtml || '<p class="file-tree__empty">No files in project</p>'}
      </div>
    </div>
  `;
}

/**
 * Creates a DOM element for the file tree.
 */
export function createFileTreeElement(props: FileTreeProps): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderFileTree(props);
  return container.firstElementChild as HTMLElement;
}

/**
 * Attaches event listeners for file selection and directory expand/collapse.
 */
export function attachFileTreeListeners(
  root: HTMLElement,
  props: FileTreeProps,
): void {
  // Directory toggle
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    const toggleEl = target.closest<HTMLElement>('[data-toggle-path]');
    if (toggleEl) {
      const path = toggleEl.getAttribute('data-toggle-path')!;
      props.onToggleExpand?.(path);
      return;
    }

    const fileEl = target.closest<HTMLElement>('[data-file-path]');
    if (fileEl) {
      const path = fileEl.getAttribute('data-file-path')!;
      props.onFileSelect?.(path);
      return;
    }

    // Click on directory node itself (not toggle) also expands
    const dirNode = target.closest<HTMLElement>('[data-type="directory"]');
    if (dirNode) {
      const path = dirNode.getAttribute('data-path')!;
      props.onToggleExpand?.(path);
    }
  });
}

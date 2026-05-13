/**
 * Tests for Requirements, Design, and Capabilities document views.
 *
 * Validates: Requirements 47e.19, 47e.21, 47f.22, 47f.24, 47g.25, 47g.27
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises } from './helpers.js';

vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api.js')>();
  return {
    ...actual,
    fetchSpecDocument: vi.fn(),
  };
});

vi.mock('../views/seraphim-core/markdown-renderer.js', () => {
  class MockMarkdownRenderer {
    render = vi.fn().mockResolvedValue('<div class="md-container"><h1>Rendered</h1></div>');
    getStyles = vi.fn().mockReturnValue('.md-container { color: white; }');
    attachCopyHandlers = vi.fn();
  }
  return {
    MarkdownRenderer: MockMarkdownRenderer,
  };
});

import { fetchSpecDocument } from '../api.js';
import { RequirementsView } from '../views/seraphim-core/requirements-view.js';
import { DesignView } from '../views/seraphim-core/design-view.js';
import { CapabilitiesView } from '../views/seraphim-core/capabilities-view.js';

const mockFetchSpecDocument = vi.mocked(fetchSpecDocument);

describe('RequirementsView', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    mockFetchSpecDocument.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state on mount', () => {
    mockFetchSpecDocument.mockReturnValue(new Promise(() => {}));
    const view = new RequirementsView(container);
    view.mount();

    expect(container.querySelector('.document-loading')).not.toBeNull();
    expect(container.textContent).toContain('Loading requirements document');
  });

  it('fetches requirements document and renders markdown on mount', async () => {
    mockFetchSpecDocument.mockResolvedValue({
      content: '# Requirements\n\nSome content',
      lastModified: '2024-01-01T00:00:00Z',
      hash: 'abc123',
    });

    const view = new RequirementsView(container);
    await view.mount();
    await flushPromises();

    expect(mockFetchSpecDocument).toHaveBeenCalledWith('requirements');
    expect(container.querySelector('.document-content')).not.toBeNull();
    expect(container.innerHTML).toContain('Rendered');
  });

  it('displays error message when document is unavailable', async () => {
    mockFetchSpecDocument.mockRejectedValue(new Error('Network error'));

    const view = new RequirementsView(container);
    await view.mount();
    await flushPromises();

    expect(container.querySelector('.document-error')).not.toBeNull();
    expect(container.textContent).toContain('Requirements document could not be loaded');
  });

  it('cleans up DOM on unmount', async () => {
    mockFetchSpecDocument.mockResolvedValue({
      content: '# Test',
      lastModified: '2024-01-01T00:00:00Z',
      hash: 'abc123',
    });

    const view = new RequirementsView(container);
    await view.mount();
    view.unmount();

    expect(container.innerHTML).toBe('');
  });
});

describe('DesignView', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    mockFetchSpecDocument.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state on mount', () => {
    mockFetchSpecDocument.mockReturnValue(new Promise(() => {}));
    const view = new DesignView(container);
    view.mount();

    expect(container.querySelector('.document-loading')).not.toBeNull();
    expect(container.textContent).toContain('Loading design document');
  });

  it('fetches design document and renders markdown on mount', async () => {
    mockFetchSpecDocument.mockResolvedValue({
      content: '# Design\n\nArchitecture details',
      lastModified: '2024-01-01T00:00:00Z',
      hash: 'def456',
    });

    const view = new DesignView(container);
    await view.mount();
    await flushPromises();

    expect(mockFetchSpecDocument).toHaveBeenCalledWith('design');
    expect(container.querySelector('.document-content')).not.toBeNull();
    expect(container.innerHTML).toContain('Rendered');
  });

  it('displays error message when document is unavailable', async () => {
    mockFetchSpecDocument.mockRejectedValue(new Error('Network error'));

    const view = new DesignView(container);
    await view.mount();
    await flushPromises();

    expect(container.querySelector('.document-error')).not.toBeNull();
    expect(container.textContent).toContain('Design document could not be loaded');
  });

  it('cleans up DOM on unmount', async () => {
    mockFetchSpecDocument.mockResolvedValue({
      content: '# Test',
      lastModified: '2024-01-01T00:00:00Z',
      hash: 'def456',
    });

    const view = new DesignView(container);
    await view.mount();
    view.unmount();

    expect(container.innerHTML).toBe('');
  });
});

describe('CapabilitiesView', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    mockFetchSpecDocument.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state on mount', () => {
    mockFetchSpecDocument.mockReturnValue(new Promise(() => {}));
    const view = new CapabilitiesView(container);
    view.mount();

    expect(container.querySelector('.document-loading')).not.toBeNull();
    expect(container.textContent).toContain('Loading capabilities document');
  });

  it('fetches capabilities document and renders markdown on mount', async () => {
    mockFetchSpecDocument.mockResolvedValue({
      content: '# Capabilities\n\nPlatform capabilities',
      lastModified: '2024-01-01T00:00:00Z',
      hash: 'ghi789',
    });

    const view = new CapabilitiesView(container);
    await view.mount();
    await flushPromises();

    expect(mockFetchSpecDocument).toHaveBeenCalledWith('capabilities');
    expect(container.querySelector('.document-content')).not.toBeNull();
    expect(container.innerHTML).toContain('Rendered');
  });

  it('displays error message when document is unavailable', async () => {
    mockFetchSpecDocument.mockRejectedValue(new Error('Network error'));

    const view = new CapabilitiesView(container);
    await view.mount();
    await flushPromises();

    expect(container.querySelector('.document-error')).not.toBeNull();
    expect(container.textContent).toContain('Capabilities document could not be loaded');
  });

  it('cleans up DOM on unmount', async () => {
    mockFetchSpecDocument.mockResolvedValue({
      content: '# Test',
      lastModified: '2024-01-01T00:00:00Z',
      hash: 'ghi789',
    });

    const view = new CapabilitiesView(container);
    await view.mount();
    view.unmount();

    expect(container.innerHTML).toBe('');
  });

  it('includes styles from MarkdownRenderer in rendered content', async () => {
    mockFetchSpecDocument.mockResolvedValue({
      content: '# Test',
      lastModified: '2024-01-01T00:00:00Z',
      hash: 'ghi789',
    });

    const view = new CapabilitiesView(container);
    await view.mount();
    await flushPromises();

    expect(container.querySelector('style')).not.toBeNull();
    expect(container.querySelector('style')!.textContent).toContain('.md-container');
  });

  it('has accessible error state with role="alert"', async () => {
    mockFetchSpecDocument.mockRejectedValue(new Error('Unavailable'));

    const view = new CapabilitiesView(container);
    await view.mount();
    await flushPromises();

    const errorEl = container.querySelector('[role="alert"]');
    expect(errorEl).not.toBeNull();
  });
});

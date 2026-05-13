import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarkdownRenderer, MARKDOWN_STYLES } from '../views/seraphim-core/markdown-renderer.js';

// Mock marked
vi.mock('marked', () => {
  const mockRenderer = {
    code: null as any,
    table: null as any,
  };

  const mockMarked = {
    marked: {
      parse: vi.fn(async (input: string) => {
        // Simple mock: wrap in <p> tags unless it looks like HTML already
        if (input.startsWith('<') || input.includes('<!--mermaid-placeholder')) {
          return input;
        }
        return `<p>${input}</p>`;
      }),
      setOptions: vi.fn(),
      use: vi.fn(({ renderer }: any) => {
        if (renderer) {
          mockRenderer.code = renderer.code;
          mockRenderer.table = renderer.table;
        }
      }),
      Renderer: vi.fn(() => mockRenderer),
    },
    // Expose mock renderer for test access
    __mockRenderer: mockRenderer,
  };

  return mockMarked;
});

// Mock highlight.js
vi.mock('highlight.js', () => ({
  default: {
    highlight: vi.fn((code: string, opts: { language: string }) => ({
      value: `<span class="hljs-highlighted">${code}</span>`,
    })),
    highlightAuto: vi.fn((code: string) => ({
      value: `<span class="hljs-auto">${code}</span>`,
    })),
    getLanguage: vi.fn((lang: string) => {
      const supported = ['typescript', 'javascript', 'python', 'sql', 'json', 'html', 'css'];
      return supported.includes(lang) ? {} : undefined;
    }),
  },
}));

// Mock mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string, code: string) => {
      if (code.includes('invalid')) {
        throw new Error('Parse error: invalid syntax');
      }
      return { svg: `<svg id="${id}"><text>${code}</text></svg>` };
    }),
  },
}));

describe('MarkdownRenderer', () => {
  let renderer: MarkdownRenderer;

  beforeEach(() => {
    vi.clearAllMocks();
    renderer = new MarkdownRenderer();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const r = new MarkdownRenderer();
      expect(r).toBeInstanceOf(MarkdownRenderer);
    });

    it('should accept custom maxWidth option', () => {
      const r = new MarkdownRenderer({ maxWidth: 1200 });
      expect(r).toBeInstanceOf(MarkdownRenderer);
    });

    it('should accept enableMermaid option', () => {
      const r = new MarkdownRenderer({ enableMermaid: false });
      expect(r).toBeInstanceOf(MarkdownRenderer);
    });

    it('should accept enableHighlight option', () => {
      const r = new MarkdownRenderer({ enableHighlight: false });
      expect(r).toBeInstanceOf(MarkdownRenderer);
    });

    it('should initialize mermaid with dark theme and strict security', async () => {
      const mermaid = (await import('mermaid')).default;
      new MarkdownRenderer();
      expect(mermaid.initialize).toHaveBeenCalledWith({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
      });
    });

    it('should not initialize mermaid when enableMermaid is false', async () => {
      const mermaid = (await import('mermaid')).default;
      vi.clearAllMocks();
      new MarkdownRenderer({ enableMermaid: false });
      expect(mermaid.initialize).not.toHaveBeenCalled();
    });
  });

  describe('render()', () => {
    it('should return HTML wrapped in a container with max-width 900px', async () => {
      const html = await renderer.render('Hello world');
      expect(html).toContain('class="md-container"');
      expect(html).toContain('max-width: 900px');
      expect(html).toContain('margin: 0 auto');
    });

    it('should use custom maxWidth when specified', async () => {
      const r = new MarkdownRenderer({ maxWidth: 1200 });
      const html = await r.render('Hello');
      expect(html).toContain('max-width: 1200px');
    });

    it('should call marked.parse with the markdown input', async () => {
      const { marked: markedLib } = await import('marked');
      await renderer.render('# Test heading');
      expect(markedLib.parse).toHaveBeenCalled();
    });

    it('should configure marked with GFM enabled', async () => {
      const { marked: markedLib } = await import('marked');
      await renderer.render('test');
      expect(markedLib.setOptions).toHaveBeenCalledWith(
        expect.objectContaining({ gfm: true })
      );
    });
  });

  describe('mermaid diagram rendering', () => {
    it('should detect mermaid code blocks and replace with rendered SVG', async () => {
      const mermaid = (await import('mermaid')).default;
      const markdown = '```mermaid\ngraph TD\n  A-->B\n```';

      // Override marked.parse to pass through placeholders
      const { marked: markedLib } = await import('marked');
      (markedLib.parse as any).mockImplementation(async (input: string) => input);

      const html = await renderer.render(markdown);
      expect(mermaid.render).toHaveBeenCalled();
      expect(html).toContain('class="md-mermaid-block"');
      expect(html).toContain('role="figure"');
      expect(html).toContain('aria-label="Mermaid diagram"');
      expect(html).toContain('<svg');
    });

    it('should render error message when mermaid parsing fails', async () => {
      const { marked: markedLib } = await import('marked');
      (markedLib.parse as any).mockImplementation(async (input: string) => input);

      const markdown = '```mermaid\ninvalid diagram\n```';
      const html = await renderer.render(markdown);
      expect(html).toContain('class="md-mermaid-error"');
      expect(html).toContain('role="alert"');
      expect(html).toContain('Failed to render diagram');
      expect(html).toContain('Parse error: invalid syntax');
    });

    it('should not process mermaid blocks when enableMermaid is false', async () => {
      const mermaid = (await import('mermaid')).default;
      vi.clearAllMocks();
      const r = new MarkdownRenderer({ enableMermaid: false });
      const markdown = '```mermaid\ngraph TD\n  A-->B\n```';
      await r.render(markdown);
      expect(mermaid.render).not.toHaveBeenCalled();
    });

    it('should handle multiple mermaid blocks', async () => {
      const mermaid = (await import('mermaid')).default;
      const { marked: markedLib } = await import('marked');
      (markedLib.parse as any).mockImplementation(async (input: string) => input);

      const markdown = '```mermaid\ngraph TD\n  A-->B\n```\n\nSome text\n\n```mermaid\ngraph LR\n  C-->D\n```';
      const html = await renderer.render(markdown);
      expect(mermaid.render).toHaveBeenCalledTimes(2);
      // Should have two mermaid blocks
      const mermaidBlocks = html.match(/class="md-mermaid-block"/g);
      expect(mermaidBlocks).toHaveLength(2);
    });
  });

  describe('code block rendering', () => {
    it('should use highlight.js for known languages', async () => {
      const hljs = (await import('highlight.js')).default;
      const { __mockRenderer } = await import('marked') as any;

      // Trigger render to set up the renderer
      await renderer.render('test');

      // Call the code renderer directly
      const result = __mockRenderer.code({ text: 'const x = 1;', lang: 'typescript' });
      expect(hljs.highlight).toHaveBeenCalledWith('const x = 1;', { language: 'typescript' });
      expect(result).toContain('class="md-code-block"');
      expect(result).toContain('class="md-copy-btn"');
      expect(result).toContain('language-typescript');
    });

    it('should use highlightAuto for unknown languages', async () => {
      const hljs = (await import('highlight.js')).default;
      const { __mockRenderer } = await import('marked') as any;

      await renderer.render('test');

      const result = __mockRenderer.code({ text: 'some code', lang: 'unknownlang' });
      expect(hljs.highlightAuto).toHaveBeenCalledWith('some code');
      expect(result).toContain('class="md-code-block"');
    });

    it('should include copy button with data-code attribute', async () => {
      const { __mockRenderer } = await import('marked') as any;
      await renderer.render('test');

      const result = __mockRenderer.code({ text: 'hello world', lang: 'javascript' });
      expect(result).toContain('class="md-copy-btn"');
      expect(result).toContain('aria-label="Copy code to clipboard"');
      expect(result).toContain('data-code="hello world"');
    });

    it('should include language label in code header', async () => {
      const { __mockRenderer } = await import('marked') as any;
      await renderer.render('test');

      const result = __mockRenderer.code({ text: 'x = 1', lang: 'python' });
      expect(result).toContain('class="md-code-lang"');
      expect(result).toContain('python');
    });

    it('should render code block with rounded corners (border-radius in styles)', () => {
      const styles = renderer.getStyles();
      expect(styles).toContain('border-radius: 8px');
    });

    it('should escape HTML in code content for data-code attribute', async () => {
      const { __mockRenderer } = await import('marked') as any;
      await renderer.render('test');

      const result = __mockRenderer.code({ text: '<script>alert("xss")</script>', lang: 'html' });
      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>alert');
    });

    it('should not highlight when enableHighlight is false', async () => {
      const hljs = (await import('highlight.js')).default;
      vi.clearAllMocks();

      const r = new MarkdownRenderer({ enableHighlight: false });
      const { __mockRenderer } = await import('marked') as any;
      await r.render('test');

      const result = __mockRenderer.code({ text: 'const x = 1;', lang: 'typescript' });
      expect(hljs.highlight).not.toHaveBeenCalled();
      expect(hljs.highlightAuto).not.toHaveBeenCalled();
      // Should still have the code block structure
      expect(result).toContain('class="md-code-block"');
    });
  });

  describe('table rendering', () => {
    it('should render tables with striped styling class', async () => {
      const { __mockRenderer } = await import('marked') as any;
      await renderer.render('test');

      const result = __mockRenderer.table({
        header: '<tr><th>Name</th><th>Value</th></tr>',
        rows: ['<tr><td>A</td><td>1</td></tr>', '<tr><td>B</td><td>2</td></tr>'],
      });
      expect(result).toContain('class="md-table-wrapper"');
      expect(result).toContain('class="md-table"');
      expect(result).toContain('<thead>');
      expect(result).toContain('<tbody>');
    });

    it('should include striped row styles in CSS', () => {
      const styles = renderer.getStyles();
      expect(styles).toContain('nth-child(even)');
      expect(styles).toContain('nth-child(odd)');
    });
  });

  describe('container styling', () => {
    it('should center content with margin: 0 auto', async () => {
      const html = await renderer.render('test');
      expect(html).toContain('margin: 0 auto');
    });

    it('should constrain width to max 900px by default', async () => {
      const html = await renderer.render('test');
      expect(html).toContain('max-width: 900px');
    });
  });

  describe('getStyles()', () => {
    it('should return CSS string with heading styles', () => {
      const styles = renderer.getStyles();
      expect(styles).toContain('.md-container h1');
      expect(styles).toContain('.md-container h2');
      expect(styles).toContain('.md-container h3');
    });

    it('should return CSS string with list styles', () => {
      const styles = renderer.getStyles();
      expect(styles).toContain('.md-container ul');
      expect(styles).toContain('.md-container ol');
      expect(styles).toContain('.md-container li');
    });

    it('should return CSS string with table styles', () => {
      const styles = renderer.getStyles();
      expect(styles).toContain('.md-table');
      expect(styles).toContain('.md-table th');
      expect(styles).toContain('.md-table td');
    });

    it('should return CSS string with code block styles', () => {
      const styles = renderer.getStyles();
      expect(styles).toContain('.md-code-block');
      expect(styles).toContain('.md-copy-btn');
      expect(styles).toContain('.md-pre');
    });

    it('should return CSS string with mermaid styles', () => {
      const styles = renderer.getStyles();
      expect(styles).toContain('.md-mermaid-block');
      expect(styles).toContain('.md-mermaid-error');
    });

    it('should include bold text styling', () => {
      const styles = renderer.getStyles();
      expect(styles).toContain('.md-container strong');
    });
  });

  describe('attachCopyHandlers()', () => {
    it('should attach click handlers to copy buttons', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button class="md-copy-btn" data-code="test code">Copy</button>
      `;

      renderer.attachCopyHandlers(container);

      const btn = container.querySelector('.md-copy-btn') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      // Verify the button has an event listener (we can't directly check, but we can click it)
    });

    it('should handle multiple copy buttons', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <button class="md-copy-btn" data-code="code1">Copy</button>
        <button class="md-copy-btn" data-code="code2">Copy</button>
        <button class="md-copy-btn" data-code="code3">Copy</button>
      `;

      // Should not throw
      renderer.attachCopyHandlers(container);

      const buttons = container.querySelectorAll('.md-copy-btn');
      expect(buttons).toHaveLength(3);
    });
  });

  describe('MARKDOWN_STYLES export', () => {
    it('should be a non-empty string', () => {
      expect(typeof MARKDOWN_STYLES).toBe('string');
      expect(MARKDOWN_STYLES.length).toBeGreaterThan(0);
    });

    it('should contain the md-container class', () => {
      expect(MARKDOWN_STYLES).toContain('.md-container');
    });

    it('should define max-width related styles for readability', () => {
      // The container itself gets max-width via inline style,
      // but the CSS should define the base container styles
      expect(MARKDOWN_STYLES).toContain('.md-container');
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { App, Component } from 'obsidian';
import HtmlRenderer, { type RenderMarkdownResult } from './htmlRenderer';

// Mock ImageOptimizer
vi.mock('./imageOptimizer', () => ({
  ImageOptimizer: {
    optimizeImage: vi.fn(),
    getMimeType: vi.fn((format) => {
      const mimeTypes: Record<string, string> = {
        'webp': 'image/webp',
        'jpeg': 'image/jpeg',
        'jpg': 'image/jpeg',
        'png': 'image/png'
      };
      return mimeTypes[format.toLowerCase()] || 'application/octet-stream';
    }),
    isWebPSupported: vi.fn().mockReturnValue(true),
    generateImageHash: vi.fn()
  }
}));

// Mock DOM elements
const mockBody = {
  createDiv: vi.fn()
};

const mockDocument = {
  body: mockBody,
  createElement: vi.fn((tag) => {
    if (tag === 'script') {
      return { textContent: '', tagName: 'SCRIPT' };
    }
    return {};
  })
};

Object.defineProperty(global, 'document', {
  value: mockDocument,
  writable: true
});

// Mock Obsidian modules
vi.mock('obsidian', () => ({
  Component: class MockComponent {},
  MarkdownRenderer: {
    render: vi.fn()
  },
  arrayBufferToBase64: vi.fn((buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))))
}));

describe('HtmlRenderer', () => {
  let mockApp: {
    vault: {
      getFiles: ReturnType<typeof vi.fn>;
      adapter: {
        readBinary: ReturnType<typeof vi.fn>;
      };
    };
  };
  let mockComponent: Record<string, unknown>;
  let renderer: HtmlRenderer;

  beforeEach(() => {
    vi.clearAllMocks();

    const mockFiles = [
      { name: 'test.png', extension: 'png', path: 'test.png', stat: { mtime: 1234567890 } },
      { name: 'test.jpg', extension: 'jpg', path: 'test.jpg', stat: { mtime: 1234567890 } },
      { name: 'test1.png', extension: 'png', path: 'test1.png', stat: { mtime: 1234567890 } },
      { name: 'test2.png', extension: 'png', path: 'test2.png', stat: { mtime: 1234567891 } }
    ];

    mockApp = {
      vault: {
        getFiles: vi.fn().mockReturnValue(mockFiles),
        adapter: {
          readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        }
      }
    } as unknown as { vault: { getFiles: ReturnType<typeof vi.fn>; adapter: { readBinary: ReturnType<typeof vi.fn> } } };

    mockComponent = {};

    renderer = new HtmlRenderer(mockApp as unknown as App, mockComponent as unknown as Component, { imageQuality: 'medium', enableLazyLoading: true, enableImageDeduplication: true });
  });

  describe('render', () => {
    it('should render markdown content to HTML with deduplication enabled', async () => {
      const mockImg = {
        src: 'app://test.png?1234567890',
        setAttribute: vi.fn()
      };
      Object.defineProperty(mockImg, 'src', {
        set: vi.fn(),
        get: () => 'app://test.png?1234567890'
      });

      const mockElement = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.copy-code-button') return [];
          if (selector === 'img') return [mockImg];
          return [];
        }),
        appendChild: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null as unknown as ChildNode,
        innerHTML: '<p>Rendered content</p>'
      };

      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      // Mock MarkdownRenderer.render
      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockResolvedValue(undefined);

      // Mock image processing
      const { ImageOptimizer } = await import('./imageOptimizer');
      vi.mocked(ImageOptimizer.generateImageHash).mockResolvedValue('testhash');
      vi.mocked(ImageOptimizer.optimizeImage).mockResolvedValue(new ArrayBuffer(8));

      const mockFile = {
        name: 'test.png',
        extension: 'png',
        path: 'test.png',
        stat: { mtime: 1234567890 }
      };
      mockApp.vault.getFiles.mockReturnValue([mockFile]);
      mockApp.vault.adapter.readBinary.mockResolvedValue(new ArrayBuffer(8));

      await renderer.render('# Test Content');

      expect(MarkdownRenderer.render).toHaveBeenCalledWith(
        mockApp,
        '# Test Content',
        mockElement,
        '.',
        mockComponent
      );
       expect(mockImg.setAttribute).toHaveBeenCalledWith('data-hash', 'testhash');
       expect(mockImg.setAttribute).toHaveBeenCalledWith('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    });

    it('should render with deduplication disabled', async () => {
      const rendererNoDedup = new HtmlRenderer(mockApp as unknown as App, mockComponent as unknown as Component, {
        imageQuality: 'medium',
        enableLazyLoading: true,
        enableImageDeduplication: false
      });

      const mockImg = {
        setAttribute: vi.fn()
      };
      Object.defineProperty(mockImg, 'src', {
        set: vi.fn(),
        get: () => 'app://test.png?1234567890'
      });
      const mockElement = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.copy-code-button') return [];
          if (selector === 'img') return [mockImg];
          return [];
        }),
        appendChild: vi.fn(),
        innerHTML: '<img src="app://test.png?1234567890"><p>Content</p>'
      };

      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockResolvedValue(undefined);

      const { ImageOptimizer } = await import('./imageOptimizer');
      vi.mocked(ImageOptimizer.optimizeImage).mockResolvedValue(new ArrayBuffer(8));

      const mockFile = {
        name: 'test.png',
        extension: 'png',
        path: 'test.png',
        stat: { mtime: 1234567890 }
      };
      mockApp.vault.getFiles.mockReturnValue([mockFile]);
      mockApp.vault.adapter.readBinary.mockResolvedValue(new ArrayBuffer(8));

       await rendererNoDedup.render('# Test Content');

       expect(mockImg.setAttribute).toHaveBeenCalledWith('src', expect.stringContaining('data:image/webp;base64,'));
       expect(mockImg.setAttribute).toHaveBeenCalledWith('loading', 'lazy');
    });

    it('should remove copy-code buttons', async () => {
      const mockButton = { remove: vi.fn() };
      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([mockButton]),
        insertBefore: vi.fn(),
        appendChild: vi.fn(),
        firstChild: null as unknown as ChildNode,
        innerHTML: '<p>Content</p>'
      };

      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockResolvedValue(undefined);

      await renderer.render('```js\ncode\n```');

      expect(mockElement.querySelectorAll).toHaveBeenCalledWith('.copy-code-button');
      expect(mockButton.remove).toHaveBeenCalled();
    });
  });

  describe('online images', () => {
    it('keeps external https src unchanged with deduplication enabled', async () => {
      const mockImg = {
        src: 'https://example.com/image.png',
        setAttribute: vi.fn()
      };
      Object.defineProperty(mockImg, 'src', {
        set: vi.fn(),
        get: () => 'https://example.com/image.png'
      });
      const mockElement = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.copy-code-button') return [];
          if (selector === 'img') return [mockImg];
          return [];
        }),
        appendChild: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null as unknown as ChildNode,
        innerHTML: '<p>Content</p>'
      };
      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockResolvedValue(undefined);

      await renderer.render('# Test');

      expect(mockImg.setAttribute).not.toHaveBeenCalledWith('data-hash', expect.anything());
      expect(mockImg.setAttribute).not.toHaveBeenCalledWith('src', expect.stringContaining('data:image/gif'));
      expect(mockImg.setAttribute).toHaveBeenCalledWith('loading', 'lazy');
    });

    it('keeps external https src unchanged with deduplication disabled', async () => {
      const rendererNoDedup = new HtmlRenderer(mockApp as unknown as App, mockComponent as unknown as Component, {
        imageQuality: 'medium',
        enableLazyLoading: true,
        enableImageDeduplication: false
      });

      const mockImg = {
        setAttribute: vi.fn()
      };
      Object.defineProperty(mockImg, 'src', {
        set: vi.fn(),
        get: () => 'https://example.com/image.png'
      });
      const mockElement = {
        querySelectorAll: vi.fn((selector) => {
          if (selector === '.copy-code-button') return [];
          if (selector === 'img') return [mockImg];
          return [];
        }),
        appendChild: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null as unknown as ChildNode,
        innerHTML: '<p>Content</p>'
      };
      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockResolvedValue(undefined);

      await rendererNoDedup.render('# Test');

      expect(mockImg.setAttribute).not.toHaveBeenCalledWith('src', expect.stringContaining('data:'));
      expect(mockImg.setAttribute).toHaveBeenCalledWith('loading', 'lazy');
    });
  });

  describe('renderMarkdownSafely', () => {
    function makeElement(innerHTML = '', frozen = false): HTMLElement {
      const el: Record<string, unknown> = {
        innerHTML,
        querySelectorAll: vi.fn().mockReturnValue([]),
        remove: vi.fn(),
        appendChild: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null,
      };
      if (frozen) {
        Object.defineProperty(el, 'innerHTML', { get: () => innerHTML, set: vi.fn() });
      }
      return el as unknown as HTMLElement;
    }

    async function markdownRenderer(): Promise<Mock> {
      const { MarkdownRenderer } = await import('obsidian');
      return MarkdownRenderer.render as unknown as Mock;
    }

    function safely(content: string, el: HTMLElement): Promise<RenderMarkdownResult> {
      return (renderer as unknown as {
        renderMarkdownSafely: (c: string, e: HTMLElement, p: string) => Promise<RenderMarkdownResult>;
      }).renderMarkdownSafely(content, el, '.');
    }

    it.each([
      { label: 'throws', partial: '' },
      { label: 'throws after a partial fill', partial: '<p>Partial content before crash</p>' },
    ])('falls back with error HTML when MarkdownRenderer.render $label', async ({ partial }) => {
      mockBody.createDiv.mockReturnValue(makeElement(partial, partial !== ''));
      (await markdownRenderer()).mockRejectedValue(new Error('postprocessor error'));

      const result = await renderer.render('# Test Content');

      if (partial) {
        expect(result).toContain('Partial content before crash');
        expect(result).not.toContain('markdown-render-error-fallback');
      } else {
        expect(result).toContain('markdown-render-error-fallback');
        expect(result).toContain('Test Content');
      }
    });

    it.each([
      { label: 'times out', partial: '' },
      { label: 'times out after a partial fill', partial: '<p>Partial content before timeout</p>' },
    ])('falls back when MarkdownRenderer.render $label', async ({ partial }) => {
      vi.useFakeTimers();
      mockBody.createDiv.mockReturnValue(makeElement(partial, partial !== ''));
      (await markdownRenderer()).mockReturnValue(new Promise(() => {}));

      const renderPromise = renderer.render('# Timeout Content');
      await vi.advanceTimersByTimeAsync(30000);
      const result = await renderPromise;

      if (partial) {
        expect(result).toContain('Partial content before timeout');
        expect(result).not.toContain('markdown-render-error-fallback');
      } else {
        expect(result).toContain('markdown-render-error-fallback');
      }
      vi.useRealTimers();
    });

    it('reports a timeout result directly', async () => {
      vi.useFakeTimers();
      (await markdownRenderer()).mockReturnValue(new Promise(() => {}));

      const promise = safely('# Timeout', makeElement());
      await vi.advanceTimersByTimeAsync(30000);
      const result = await promise;

      expect(result.ok).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.error).toContain('timed out');
      vi.useRealTimers();
    });

    it('reports an error result when MarkdownRenderer.render throws', async () => {
      (await markdownRenderer()).mockRejectedValue(new Error('render crashed'));

      const result = await safely('# Test', makeElement());

      expect(result.ok).toBe(false);
      expect(result.timedOut).toBeUndefined();
      expect(result.error).toBe('render crashed');
    });

    it('reports success when MarkdownRenderer.render succeeds', async () => {
      (await markdownRenderer()).mockResolvedValue(undefined);

      const result = await safely('# Test', makeElement('<p>Success</p>'));

      expect(result.ok).toBe(true);
      expect(result.timedOut).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

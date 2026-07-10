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

  describe('convertImageToBase64String', () => {
    it('should convert image to base64', async () => {
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

      const result = await (renderer as unknown as { convertImageToBase64String: (path: string) => Promise<string> }).convertImageToBase64String('app://test.png?1234567890');

      expect(mockApp.vault.getFiles).toHaveBeenCalled();
      expect(mockApp.vault.adapter.readBinary).toHaveBeenCalledWith('test.png');
      expect(result).toContain('data:image/webp;base64,');
    });

    it('should fallback to original format when optimization fails', async () => {
      const mockFile = {
        name: 'test.jpg',
        extension: 'jpg',
        path: 'test.jpg',
        stat: { mtime: 1234567890 }
      };

      mockApp.vault.getFiles.mockReturnValue([mockFile]);
      const originalBuffer = new ArrayBuffer(8);
      mockApp.vault.adapter.readBinary.mockResolvedValue(originalBuffer);

      // Mock optimizeImage to throw
      const { ImageOptimizer } = await import('./imageOptimizer');
      vi.mocked(ImageOptimizer.optimizeImage).mockRejectedValue(new Error('WebP not supported'));

      const result = await (renderer as unknown as { convertImageToBase64String: (path: string) => Promise<string> }).convertImageToBase64String('app://test.jpg?1234567890');

      expect(result).toContain('data:image/jpeg;base64,');
    });

    it('should return empty string for missing images', async () => {
      mockApp.vault.getFiles.mockReturnValue([]);

      const result = await (renderer as unknown as { convertImageToBase64String: (path: string) => Promise<string> }).convertImageToBase64String('app://missing.png?123');

      expect(result).toBe('');
    });

    it('should cache and reuse optimized images for identical content', async () => {
      const { ImageOptimizer } = await import('./imageOptimizer');
      const mockBuffer = new ArrayBuffer(8);
      const mockOptimizedBuffer = new ArrayBuffer(4);
      const mockHash = 'abcd1234';

      vi.mocked(ImageOptimizer.generateImageHash).mockResolvedValue(mockHash);
      vi.mocked(ImageOptimizer.optimizeImage).mockResolvedValue(mockOptimizedBuffer);

      const mockFile = {
        name: 'test.png',
        extension: 'png',
        path: 'test.png',
        stat: { mtime: 1234567890 }
      };

      mockApp.vault.getFiles.mockReturnValue([mockFile]);
      mockApp.vault.adapter.readBinary.mockResolvedValue(mockBuffer);

      // First call - should optimize and cache
      const result1 = await (renderer as unknown as { convertImageToBase64String: (path: string) => Promise<string> }).convertImageToBase64String('app://test.png?1234567890');
      expect(ImageOptimizer.optimizeImage).toHaveBeenCalledTimes(1);
      expect(result1).toContain('data:image/webp;base64,');

      // Second call with same image - should use cache
      const result2 = await (renderer as unknown as { convertImageToBase64String: (path: string) => Promise<string> }).convertImageToBase64String('app://test.png?1234567890');
      expect(ImageOptimizer.optimizeImage).toHaveBeenCalledTimes(1); // Still 1, not called again
      expect(result2).toBe(result1); // Same result
    });

    it('should handle different images with different hashes', async () => {
      const { ImageOptimizer } = await import('./imageOptimizer');
      const mockBuffer1 = new ArrayBuffer(8);
      const mockBuffer2 = new ArrayBuffer(8);
      const mockOptimizedBuffer1 = new Uint8Array([1, 2, 3, 4]).buffer;
      const mockOptimizedBuffer2 = new Uint8Array([5, 6, 7, 8]).buffer;
      const mockHash1 = 'abcd1234';
      const mockHash2 = 'efgh5678';

      vi.mocked(ImageOptimizer.generateImageHash)
        .mockResolvedValueOnce(mockHash1)
        .mockResolvedValueOnce(mockHash2);
      vi.mocked(ImageOptimizer.optimizeImage)
        .mockResolvedValueOnce(mockOptimizedBuffer1)
        .mockResolvedValueOnce(mockOptimizedBuffer2);

      const mockFile1 = {
        name: 'test1.png',
        extension: 'png',
        path: 'test1.png',
        stat: { mtime: 1234567890 }
      };
      const mockFile2 = {
        name: 'test2.png',
        extension: 'png',
        path: 'test2.png',
        stat: { mtime: 1234567891 }
      };

      mockApp.vault.getFiles.mockReturnValue([mockFile1, mockFile2]);
      mockApp.vault.adapter.readBinary
        .mockResolvedValueOnce(mockBuffer1)
        .mockResolvedValueOnce(mockBuffer2);

      // First image
      const result1 = await (renderer as unknown as { convertImageToBase64String: (path: string) => Promise<string> }).convertImageToBase64String('app://test1.png?1234567890');
      // Second image (different hash)
      const result2 = await (renderer as unknown as { convertImageToBase64String: (path: string) => Promise<string> }).convertImageToBase64String('app://test2.png?1234567891');

      expect(ImageOptimizer.optimizeImage).toHaveBeenCalledTimes(2);
      expect(result1).not.toBe(result2);
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

  describe('blob image sources', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    it('convertImageToBase64String reads blob: via fetch and returns base64', async () => {
      const fetchMock = vi.mocked(globalThis.fetch as unknown as Mock);
      fetchMock.mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['<svg><rect/></svg>'], { type: 'image/svg+xml' })),
      });

      const { ImageOptimizer } = await import('./imageOptimizer');
      vi.mocked(ImageOptimizer.optimizeImage).mockRejectedValue(new Error('WebP not supported'));

      const result = await (renderer as unknown as { convertImageToBase64String: (path: string) => Promise<string> })
        .convertImageToBase64String('blob:test-diagram');

      expect(fetchMock).toHaveBeenCalledWith('blob:test-diagram');
      expect(result).toContain('data:image/svg+xml;base64,');
    });

    it('convertImageToHash reads blob: via fetch and returns hash', async () => {
      const fetchMock = vi.mocked(globalThis.fetch as unknown as Mock);
      fetchMock.mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['<svg><circle/></svg>'], { type: 'image/svg+xml' })),
      });

      const { ImageOptimizer } = await import('./imageOptimizer');
      vi.mocked(ImageOptimizer.generateImageHash).mockResolvedValue('blobhash');
      vi.mocked(ImageOptimizer.optimizeImage).mockRejectedValue(new Error('WebP not supported'));

      const result = await (renderer as unknown as { convertImageToHash: (path: string) => Promise<string> })
        .convertImageToHash('blob:test-diagram');

      expect(fetchMock).toHaveBeenCalledWith('blob:test-diagram');
      expect(result).toBe('blobhash');
    });

    it('returns empty for blob: URL when fetch fails', async () => {
      const fetchMock = vi.mocked(globalThis.fetch as unknown as Mock);
      fetchMock.mockRejectedValue(new Error('Network error'));

      const result = await (renderer as unknown as { convertImageToBase64String: (path: string) => Promise<string> })
        .convertImageToBase64String('blob:broken');

      expect(result).toBe('');
    });
  });

  describe('renderMarkdownSafely', () => {
    it('returns fallback HTML when MarkdownRenderer.render throws', async () => {
      const mockElement = {
        innerHTML: '',
        querySelectorAll: vi.fn().mockReturnValue([]),
        remove: vi.fn(),
        appendChild: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null as unknown as ChildNode,
      };
      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockRejectedValue(
        new Error("Cannot destructure property 'headings' of 's' as it is null"),
      );

      const result = await renderer.render('# Test Content');

      expect(result).toContain('markdown-render-error-fallback');
      expect(result).toContain('Test Content');
    });

    it('produces partial HTML when render throws but el was partially filled', async () => {
      const mockElement = {
        innerHTML: '<p>Partial content before crash</p>',
        querySelectorAll: vi.fn().mockReturnValue([]),
        remove: vi.fn(),
        appendChild: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null as unknown as ChildNode,
      };
      Object.defineProperty(mockElement, 'innerHTML', {
        get: () => '<p>Partial content before crash</p>',
        set: vi.fn(),
      });
      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockRejectedValue(
        new Error('some postprocessor error'),
      );

      const result = await renderer.render('# Hello');

      // Partial content is preserved, no fallback wrapper needed
      expect(result).toContain('Partial content before crash');
      expect(result).not.toContain('markdown-render-error-fallback');
    });

    it('returns fallback when MarkdownRenderer.render times out', async () => {
      vi.useFakeTimers();

      const mockElement = {
        innerHTML: '',
        querySelectorAll: vi.fn().mockReturnValue([]),
        remove: vi.fn(),
        appendChild: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null as unknown as ChildNode,
      };
      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockReturnValue(new Promise(() => {}));

      const renderPromise = renderer.render('# Timeout Content');

      await vi.advanceTimersByTimeAsync(30000);

      const result = await renderPromise;
      expect(result).toContain('markdown-render-error-fallback');
      expect(result).toContain('Timeout Content');

      vi.useRealTimers();
    });

    it('produces partial HTML when render times out but el was partially filled', async () => {
      vi.useFakeTimers();

      const mockElement = {
        innerHTML: '<p>Partial content before timeout</p>',
        querySelectorAll: vi.fn().mockReturnValue([]),
        remove: vi.fn(),
        appendChild: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null as unknown as ChildNode,
      };
      Object.defineProperty(mockElement, 'innerHTML', {
        get: () => '<p>Partial content before timeout</p>',
        set: vi.fn(),
      });
      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockReturnValue(new Promise(() => {}));

      const renderPromise = renderer.render('# Timeout');

      await vi.advanceTimersByTimeAsync(30000);

      const result = await renderPromise;
      expect(result).toContain('Partial content before timeout');
      expect(result).not.toContain('markdown-render-error-fallback');

      vi.useRealTimers();
    });

    it('returns { ok: false, timedOut: true } directly from renderMarkdownSafely on timeout', async () => {
      vi.useFakeTimers();

      const mockElement = {
        innerHTML: '',
        querySelectorAll: vi.fn().mockReturnValue([]),
        remove: vi.fn(),
        appendChild: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null as unknown as ChildNode,
      };
      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockReturnValue(new Promise(() => {}));

      const resultPromise = (renderer as unknown as { renderMarkdownSafely: (content: string, el: HTMLElement, sourcePath: string) => Promise<RenderMarkdownResult> })
        .renderMarkdownSafely('# Timeout', mockElement as unknown as HTMLElement, '.');

      await vi.advanceTimersByTimeAsync(30000);

      const result = await resultPromise;
      expect(result.ok).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.error).toContain('timed out');

      vi.useRealTimers();
    });

    it('returns { ok: false } when MarkdownRenderer.render throws', async () => {
      const mockElement = {
        innerHTML: '',
        querySelectorAll: vi.fn().mockReturnValue([]),
        remove: vi.fn(),
        appendChild: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null as unknown as ChildNode,
      };
      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockRejectedValue(new Error('render crashed'));

      const result = await (renderer as unknown as { renderMarkdownSafely: (content: string, el: HTMLElement, sourcePath: string) => Promise<RenderMarkdownResult> })
        .renderMarkdownSafely('# Test', mockElement as unknown as HTMLElement, '.');

      expect(result.ok).toBe(false);
      expect(result.timedOut).toBeUndefined();
      expect(result.error).toBe('render crashed');
    });

    it('returns { ok: true } when MarkdownRenderer.render succeeds', async () => {
      const mockElement = {
        innerHTML: '<p>Success</p>',
        querySelectorAll: vi.fn().mockReturnValue([]),
        remove: vi.fn(),
        appendChild: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null as unknown as ChildNode,
      };
      mockBody.createDiv.mockReturnValue(mockElement as unknown as HTMLElement);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as unknown as Mock).mockResolvedValue(undefined);

      const result = await (renderer as unknown as { renderMarkdownSafely: (content: string, el: HTMLElement, sourcePath: string) => Promise<RenderMarkdownResult> })
        .renderMarkdownSafely('# Test', mockElement as unknown as HTMLElement, '.');

      expect(result.ok).toBe(true);
      expect(result.timedOut).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { App } from 'obsidian';
import { ImageEmbedder } from './imageEmbedder';

vi.mock('./imageOptimizer', () => ({
  ImageOptimizer: {
    optimizeImage: vi.fn(),
    getMimeType: vi.fn((format: string) => {
      const mimeTypes: Record<string, string> = {
        webp: 'image/webp',
        png: 'image/png',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
      };
      return mimeTypes[format.toLowerCase()] || 'application/octet-stream';
    }),
    isWebPSupported: vi.fn().mockReturnValue(true),
    generateImageHash: vi.fn(),
  },
}));

vi.mock('obsidian', () => ({
  Component: class MockComponent {},
  MarkdownRenderer: { render: vi.fn() },
  arrayBufferToBase64: vi.fn((buffer: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buffer))),
  ),
}));

interface MockImageFile {
  name: string;
  extension: string;
  path: string;
  stat: { mtime: number };
}

const settings = { imageQuality: 'medium' as const, enableLazyLoading: true, enableImageDeduplication: true };

describe('ImageEmbedder', () => {
  let readBinary: Mock;
  let embedder: ImageEmbedder;

  function build(files: MockImageFile[], sharedCache?: Map<string, string>): ImageEmbedder {
    readBinary = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    const app = {
      vault: { getFiles: vi.fn().mockReturnValue(files), adapter: { readBinary } },
    } as unknown as App;
    return new ImageEmbedder(app, settings, sharedCache);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const { ImageOptimizer } = await import('./imageOptimizer');
    vi.mocked(ImageOptimizer.generateImageHash).mockResolvedValue('hash1');
    vi.mocked(ImageOptimizer.optimizeImage).mockResolvedValue(new ArrayBuffer(4));

    embedder = build([
      { name: 'test.png', extension: 'png', path: 'test.png', stat: { mtime: 1234567890 } },
    ]);
  });

  it('reads a vault image and returns an optimized data URI', async () => {
    const result = await embedder.convertImageToBase64String('app://test.png?1234567890');

    expect(readBinary).toHaveBeenCalledWith('test.png');
    expect(result).toContain('data:image/webp;base64,');
  });

  it('falls back to the original format when optimization fails', async () => {
    const { ImageOptimizer } = await import('./imageOptimizer');
    vi.mocked(ImageOptimizer.optimizeImage).mockRejectedValue(new Error('WebP not supported'));
    const jpg = build([
      { name: 'test.jpg', extension: 'jpg', path: 'test.jpg', stat: { mtime: 1234567890 } },
    ]);

    const result = await jpg.convertImageToBase64String('app://test.jpg?1234567890');

    expect(result).toContain('data:image/jpeg;base64,');
  });

  it('returns an empty string for a missing image', async () => {
    const empty = build([]);
    expect(await empty.convertImageToBase64String('app://missing.png?123')).toBe('');
  });

  it('stales a cached image when the file timestamp does not match', async () => {
    const result = await embedder.convertImageToBase64String('app://test.png?999');
    expect(result).toBe('');
  });

  it('caches and reuses the optimized image for identical content', async () => {
    const { ImageOptimizer } = await import('./imageOptimizer');

    const first = await embedder.convertImageToBase64String('app://test.png?1234567890');
    const second = await embedder.convertImageToBase64String('app://test.png?1234567890');

    expect(ImageOptimizer.optimizeImage).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('optimizes different images separately', async () => {
    const { ImageOptimizer } = await import('./imageOptimizer');
    vi.mocked(ImageOptimizer.generateImageHash)
      .mockResolvedValueOnce('hash-a')
      .mockResolvedValueOnce('hash-b');
    vi.mocked(ImageOptimizer.optimizeImage)
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3, 4]).buffer)
      .mockResolvedValueOnce(new Uint8Array([5, 6, 7, 8]).buffer);
    const two = build([
      { name: 'test1.png', extension: 'png', path: 'test1.png', stat: { mtime: 1234567890 } },
      { name: 'test2.png', extension: 'png', path: 'test2.png', stat: { mtime: 1234567891 } },
    ]);
    readBinary
      .mockResolvedValueOnce(new ArrayBuffer(8))
      .mockResolvedValueOnce(new ArrayBuffer(8));

    const first = await two.convertImageToBase64String('app://test1.png?1234567890');
    const second = await two.convertImageToBase64String('app://test2.png?1234567891');

    expect(ImageOptimizer.optimizeImage).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
  });

  describe('blob sources', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['<svg><rect/></svg>'], { type: 'image/svg+xml' })),
      });
    });

    it('reads blob: via fetch and returns a data URI', async () => {
      const { ImageOptimizer } = await import('./imageOptimizer');
      vi.mocked(ImageOptimizer.optimizeImage).mockRejectedValue(new Error('unsupported'));

      const result = await embedder.convertImageToBase64String('blob:test-diagram');

      expect(globalThis.fetch).toHaveBeenCalledWith('blob:test-diagram');
      expect(result).toContain('data:image/svg+xml;base64,');
    });

    it('reads blob: via fetch and returns the hash', async () => {
      const { ImageOptimizer } = await import('./imageOptimizer');
      vi.mocked(ImageOptimizer.generateImageHash).mockResolvedValue('blobhash');

      const result = await embedder.convertImageToHash('blob:test-diagram');

      expect(result).toBe('blobhash');
    });

    it('returns empty when fetch fails', async () => {
      vi.mocked(globalThis.fetch as unknown as Mock).mockRejectedValue(new Error('Network error'));
      expect(await embedder.convertImageToBase64String('blob:broken')).toBe('');
    });
  });
});

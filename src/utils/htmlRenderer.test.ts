import { describe, it, expect, vi, beforeEach } from 'vitest';
import HtmlRenderer from './htmlRenderer';

// Mock DOM elements
const mockBody = {
  createDiv: vi.fn()
};

const mockDocument = {
  body: mockBody
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
  let mockApp: any;
  let mockComponent: any;
  let renderer: HtmlRenderer;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup mock app
    mockApp = {
      vault: {
        getFiles: vi.fn(),
        adapter: {
          readBinary: vi.fn()
        }
      }
    };

    // Setup mock component
    mockComponent = {};

    // Create renderer instance
    renderer = new HtmlRenderer(mockApp, mockComponent);
  });

  describe('render', () => {
    it('should render markdown content to HTML', async () => {
      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([]),
        innerHTML: '<p>Rendered content</p>'
      };

      mockBody.createDiv.mockReturnValue(mockElement as any);

      // Mock MarkdownRenderer.render
      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as any).mockResolvedValue(undefined);

      const result = await renderer.render('# Test Content');

      expect(MarkdownRenderer.render).toHaveBeenCalledWith(
        mockApp,
        '# Test Content',
        mockElement,
        '.',
        mockComponent
      );
      expect(result).toBe('<p>Rendered content</p>');
    });

    it('should remove copy-code buttons', async () => {
      const mockButton = { remove: vi.fn() };
      const mockElement = {
        querySelectorAll: vi.fn().mockReturnValue([mockButton]),
        innerHTML: '<p>Content</p>'
      };

      mockBody.createDiv.mockReturnValue(mockElement as any);

      const { MarkdownRenderer } = await import('obsidian');
      (MarkdownRenderer.render as any).mockResolvedValue(undefined);

      await renderer.render('```js\ncode\n```');

      expect(mockElement.querySelectorAll).toHaveBeenCalledWith('.copy-code-button');
      expect(mockButton.remove).toHaveBeenCalled();
    });
  });

  describe('convertImageToBase64String', () => {
    it('should convert image to base64', async () => {
      const mockFile = {
        name: 'test.png',
        extension: 'png',
        path: 'test.png',
        stat: { mtime: 1234567890 }
      };

      mockApp.vault.getFiles.mockReturnValue([mockFile]);
      mockApp.vault.adapter.readBinary.mockResolvedValue(new ArrayBuffer(8));

      const result = await (renderer as any).convertImageToBase64String('app://test.png?1234567890');

      expect(mockApp.vault.getFiles).toHaveBeenCalled();
      expect(mockApp.vault.adapter.readBinary).toHaveBeenCalledWith('test.png');
      expect(result).toContain('data:image/png;base64,');
    });

    it('should return empty string for missing images', async () => {
      mockApp.vault.getFiles.mockReturnValue([]);

      const result = await (renderer as any).convertImageToBase64String('app://missing.png?123');

      expect(result).toBe('');
    });
  });
});
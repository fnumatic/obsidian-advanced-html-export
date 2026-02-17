import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadBlob, sanitizeFilename, generateSafeFilename } from './fileUtils';

// Mock DOM elements
const mockBody = {
  appendChild: vi.fn(),
  removeChild: vi.fn()
};

const mockDocument = {
  body: mockBody,
  createElement: vi.fn()
};

Object.defineProperty(global, 'document', {
  value: mockDocument,
  writable: true
});

describe('fileUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('downloadBlob', () => {
    it('should create download link and trigger download', () => {
      const mockBlob = new Blob(['test content'], { type: 'text/plain' });
      const mockUrl = 'blob:test-url';
      const mockCreateObjectURL = vi.fn().mockReturnValue(mockUrl);
      const mockRevokeObjectURL = vi.fn();

      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      const mockClick = vi.fn();
      const mockLink = {
        href: '',
        download: '',
        click: mockClick
      };

      mockDocument.createElement.mockReturnValue(mockLink as unknown as HTMLAnchorElement);

      downloadBlob(mockBlob, 'test.txt');

      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
      expect(mockLink.href).toBe(mockUrl);
      expect(mockLink.download).toBe('test.txt');
      expect(mockBody.appendChild).toHaveBeenCalledWith(mockLink);
      expect(mockClick).toHaveBeenCalled();
      expect(mockBody.removeChild).toHaveBeenCalledWith(mockLink);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith(mockUrl);
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove invalid characters', () => {
      expect(sanitizeFilename('file<name>with:invalids/file?.txt')).toBe('file_name_with_invalids_file_.txt');
    });

    it('should replace spaces with underscores', () => {
      expect(sanitizeFilename('file with spaces.txt')).toBe('file_with_spaces.txt');
    });

    it('should handle multiple invalid characters', () => {
      expect(sanitizeFilename('file<>:"|?*.txt')).toBe('file_______.txt');
    });
  });

  describe('generateSafeFilename', () => {
    it('should generate safe filename with extension', () => {
      expect(generateSafeFilename('path/to/file.md', 'html')).toBe('file.html');
    });

    it('should sanitize filename', () => {
      expect(generateSafeFilename('path/to/file<>.md', 'html')).toBe('file__.html');
    });

    it('should use default extension', () => {
      expect(generateSafeFilename('path/to/file.md')).toBe('file.html');
    });

    it('should handle files without extension', () => {
      expect(generateSafeFilename('path/to/file')).toBe('file.html');
    });

    it('should use untitled for empty filename', () => {
      expect(generateSafeFilename('')).toBe('untitled.html');
    });
  });
});
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadBlob, sanitizeFilename, generateSafeFilename, generateWikiFilename, formatTimestamp, appendTimestamp } from './fileUtils';

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
    const date = new Date(2026, 9, 26, 16, 30, 5);

    it('should generate safe filename with timestamp and extension', () => {
      expect(generateSafeFilename('path/to/file.md', 'html', { date })).toBe(
        'file-2026-10-26_16-30-05.html',
      );
    });

    it('should sanitize filename', () => {
      expect(generateSafeFilename('path/to/file<>.md', 'html', { date })).toBe(
        'file__-2026-10-26_16-30-05.html',
      );
    });

    it('should use the given extension', () => {
      expect(generateSafeFilename('path/to/file.md', 'txt', { date })).toBe(
        'file-2026-10-26_16-30-05.txt',
      );
    });

    it('should keep dots inside the note name', () => {
      expect(generateSafeFilename('path/to/v1.2 notes.md', 'html', { date })).toBe(
        'v1.2_notes-2026-10-26_16-30-05.html',
      );
    });

    it('should handle files without extension', () => {
      expect(generateSafeFilename('path/to/file', 'html', { date })).toBe(
        'file-2026-10-26_16-30-05.html',
      );
    });

    it('should use untitled for empty filename', () => {
      expect(generateSafeFilename('', 'html', { date })).toBe('untitled-2026-10-26_16-30-05.html');
    });

    it('should omit the timestamp when disabled', () => {
      expect(generateSafeFilename('path/to/file.md', 'html', { timestamp: false })).toBe('file.html');
    });

    it('should use a custom timestamp format', () => {
      expect(generateSafeFilename('path/to/file.md', 'html', { timestamp: 'YYYY-MM-DD', date })).toBe(
        'file-2026-10-26.html',
      );
    });

    it('should produce a different name for each export', () => {
      const first = generateSafeFilename('note.md', 'html', { date: new Date(2026, 9, 26, 16, 30, 5) });
      const second = generateSafeFilename('note.md', 'html', { date: new Date(2026, 9, 26, 16, 30, 6) });
      expect(first).not.toBe(second);
    });
  });

  describe('formatTimestamp', () => {
    const date = new Date(2026, 0, 2, 3, 4, 5);

    it('should pad all parts to two digits', () => {
      expect(formatTimestamp(date)).toBe('2026-01-02_03-04-05');
    });

    it('should apply a custom format', () => {
      expect(formatTimestamp(date, 'YY.MM.DD HH:mm:ss')).toBe('26.01.02 03:04:05');
    });

    it('should keep unknown characters as literals', () => {
      expect(formatTimestamp(date, 'export-YYYY')).toBe('export-2026');
    });
  });

  describe('appendTimestamp', () => {
    const date = new Date(2026, 9, 26, 16, 30, 5);

    it('should insert the timestamp before the extension', () => {
      expect(appendTimestamp('note.html', undefined, date)).toBe('note-2026-10-26_16-30-05.html');
    });

    it('should use a custom format', () => {
      expect(appendTimestamp('note.html', 'YYYY-MM-DD', date)).toBe('note-2026-10-26.html');
    });

    it('should sanitize invalid filename characters in the format', () => {
      expect(appendTimestamp('note.html', 'YYYY/MM/DD HH:mm', date)).toBe('note-2026_10_26_16_30.html');
    });

    it('should keep multi-dot names intact', () => {
      expect(appendTimestamp('my.note.html', undefined, date)).toBe('my.note-2026-10-26_16-30-05.html');
    });

    it('should append to names without an extension', () => {
      expect(appendTimestamp('note', undefined, date)).toBe('note-2026-10-26_16-30-05');
    });
  });

  describe('generateWikiFilename', () => {
    it('should add the wiki suffix and timestamp', () => {
      const date = new Date(2026, 9, 26, 16, 30, 5);
      expect(generateWikiFilename('export/01-central-note.md', { date })).toBe(
        '01-central-note-wiki-2026-10-26_16-30-05.html',
      );
    });

    it('should fall back to wiki for empty paths', () => {
      const date = new Date(2026, 9, 26, 16, 30, 5);
      expect(generateWikiFilename('', { date })).toBe('wiki-2026-10-26_16-30-05.html');
    });

    it('should omit the timestamp when disabled', () => {
      expect(generateWikiFilename('export/01-central-note.md', { timestamp: false })).toBe(
        '01-central-note-wiki.html',
      );
    });
  });
});
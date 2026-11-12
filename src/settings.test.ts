import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, resolveTimestampFormat, timestampPreview } from './settings';
import { DEFAULT_TIMESTAMP_FORMAT } from './utils/fileUtils';

describe('resolveTimestampFormat', () => {
  it('uses the setting format when frontmatter has no value', () => {
    expect(resolveTimestampFormat(undefined, 'YYYY-MM-DD')).toBe('YYYY-MM-DD');
  });

  it('lets a frontmatter format win over the setting', () => {
    expect(resolveTimestampFormat('YYYY-MM', 'YYYY-MM-DD')).toBe('YYYY-MM');
  });

  it('disables the timestamp with false', () => {
    expect(resolveTimestampFormat(false, 'YYYY-MM-DD')).toBe(false);
  });

  it('uses the setting for true', () => {
    expect(resolveTimestampFormat(true, 'YYYY-MM-DD')).toBe('YYYY-MM-DD');
  });

  it('falls back to the default format when both are empty and true is set', () => {
    expect(resolveTimestampFormat(true, '   ')).toBe(DEFAULT_TIMESTAMP_FORMAT);
  });

  it('disables the timestamp when the setting is empty', () => {
    expect(resolveTimestampFormat(undefined, '')).toBe(false);
  });

  it('ignores invalid values and empty format strings', () => {
    expect(resolveTimestampFormat('   ', 'YYYY-MM-DD')).toBe('YYYY-MM-DD');
    expect(resolveTimestampFormat(42, 'YYYY-MM-DD')).toBe('YYYY-MM-DD');
    expect(resolveTimestampFormat(null, 'YYYY-MM-DD')).toBe('YYYY-MM-DD');
  });

  it('is off by default', () => {
    expect(resolveTimestampFormat(undefined, DEFAULT_SETTINGS.timestampFormat)).toBe(false);
  });

  it('defaults to no timestamp', () => {
    expect(DEFAULT_SETTINGS.timestampFormat).toBe('');
  });
});

describe('timestampPreview', () => {
  const date = new Date(2026, 9, 27, 16, 30, 5);

  it('shows the effect of a format', () => {
    expect(timestampPreview('YYYY', date)).toBe('note-2026.html');
    expect(timestampPreview('YYYY-MM-DD_HH-mm-ss', date)).toBe(
      'note-2026-10-27_16-30-05.html',
    );
  });

  it('shows the plain name when timestamps are off', () => {
    expect(timestampPreview('', date)).toBe('note.html');
    expect(timestampPreview('   ', date)).toBe('note.html');
  });

  it('shows the sanitized filename', () => {
    expect(timestampPreview('YYYY/MM/DD', date)).toBe('note-2026_10_27.html');
  });
});

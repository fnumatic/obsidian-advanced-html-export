import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, resolveTimestampFormat } from './settings';
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

  it('defaults to a timestamped format', () => {
    expect(DEFAULT_SETTINGS.timestampFormat).toBe(DEFAULT_TIMESTAMP_FORMAT);
  });
});

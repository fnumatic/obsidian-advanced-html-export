import { describe, it, expect } from 'vitest';
import { lastPathSegment } from './pathUtils';

describe('lastPathSegment', () => {
  it('returns the trailing segment of a path', () => {
    expect(lastPathSegment('folder/sub/photo.png')).toBe('photo.png');
  });

  it('strips a query string', () => {
    expect(lastPathSegment('app://vault/photo.png?12345')).toBe('photo.png');
  });

  it('returns the value itself when there is no separator', () => {
    expect(lastPathSegment('photo.png')).toBe('photo.png');
  });
});

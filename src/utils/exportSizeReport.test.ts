import { describe, it, expect } from 'vitest';
import {
  ARTIFACT_KIND_LABELS,
  computeShares,
  formatBytes,
  inlineDataUriBytes,
  utf8ByteLength,
  SIZE_CATEGORY_LABELS,
  SIZE_CATEGORY_ORDER,
} from './exportSizeReport';

describe('formatBytes', () => {
  it('formats byte values without a unit prefix', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats binary units with one decimal place', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('clamps invalid and negative values to zero', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
  });
});

describe('utf8ByteLength', () => {
  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('ä')).toBe(2);
    expect(utf8ByteLength('😀')).toBe(4);
  });
});

describe('computeShares', () => {
  it('computes the fraction of the total per entry', () => {
    const result = computeShares([{ bytes: 25 }, { bytes: 75 }], 100);
    expect(result[0].share).toBeCloseTo(0.25);
    expect(result[1].share).toBeCloseTo(0.75);
  });

  it('uses zero shares for a zero total', () => {
    const result = computeShares([{ bytes: 25 }], 0);
    expect(result[0].share).toBe(0);
  });
});

describe('category metadata', () => {
  it('labels every category in display order', () => {
    for (const key of SIZE_CATEGORY_ORDER) {
      expect(SIZE_CATEGORY_LABELS[key]).toBeTruthy();
    }
    expect(SIZE_CATEGORY_ORDER[0]).toBe('noteMarkup');
  });

  it('labels every artifact kind', () => {
    expect(ARTIFACT_KIND_LABELS.note).toBe('Note');
    expect(ARTIFACT_KIND_LABELS.image).toBe('Image');
    expect(ARTIFACT_KIND_LABELS.diagram).toBe('Diagram');
    expect(ARTIFACT_KIND_LABELS.codeBlock).toBe('Code');
  });
});

describe('inlineDataUriBytes', () => {
  it('sums the byte length of inline base64 data URIs', () => {
    const dataUri = 'data:image/png;base64,AAAA';
    const html = `before <img src="${dataUri}"> after`;
    expect(inlineDataUriBytes(html)).toBe(utf8ByteLength(dataUri));
  });

  it('returns zero when there is no data URI', () => {
    expect(inlineDataUriBytes('<p>no images here</p>')).toBe(0);
  });
});

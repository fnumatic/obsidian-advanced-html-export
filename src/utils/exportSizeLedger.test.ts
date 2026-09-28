import { describe, it, expect } from 'vitest';
import { ExportSizeLedger } from './exportSizeLedger';
import type { CompressionMeta } from './selfExtract';

function categoryBytes(report: ReturnType<ExportSizeLedger['finalize']>, key: string): number {
  return report.categories.find((category) => category.key === key)?.bytes ?? -1;
}

describe('ExportSizeLedger', () => {
  it('produces mutually exclusive categories that sum to the raw size', () => {
    const ledger = new ExportSizeLedger();
    ledger.recordNoteSource(100);
    ledger.recordImage({ hash: 'a', format: 'webp', originalBytes: 500, embeddedBytes: 300 });
    ledger.recordDiagrams(100);
    ledger.recordCodeBlocks(200);
    ledger.setShell({ cssBytes: 50, jsBytes: 150 });
    ledger.setRawBytes(1000);

    const report = ledger.finalize();

    expect(categoryBytes(report, 'images')).toBe(300);
    expect(categoryBytes(report, 'diagrams')).toBe(100);
    expect(categoryBytes(report, 'codeBlocks')).toBe(200);
    expect(categoryBytes(report, 'css')).toBe(50);
    expect(categoryBytes(report, 'javascript')).toBe(150);
    expect(categoryBytes(report, 'noteMarkup')).toBe(200);

    const sum = report.categories.reduce((total, category) => total + category.bytes, 0);
    expect(sum).toBe(1000);

    const shareSum = report.categories.reduce((total, category) => total + category.share, 0);
    expect(shareSum).toBeCloseTo(1);
  });

  it('never produces a negative note markup residual', () => {
    const ledger = new ExportSizeLedger();
    ledger.recordDiagrams(500);
    ledger.setRawBytes(100);
    expect(categoryBytes(ledger.finalize(), 'noteMarkup')).toBe(0);
  });

  it('counts identical images once and tracks deduplication savings', () => {
    const ledger = new ExportSizeLedger();
    ledger.recordImage({ hash: 'a', format: 'png', originalBytes: 500, embeddedBytes: 300 });
    ledger.recordImage({ hash: 'a', format: 'png', originalBytes: 500, embeddedBytes: 300 });

    const report = ledger.finalize();

    expect(report.imageReferences).toBe(2);
    expect(report.uniqueImages).toBe(1);
    expect(report.embeddedImageBytes).toBe(300);
    expect(report.vaultImageBytes).toBe(500);
    expect(report.deduplicationSavingBytes).toBe(300);
  });

  it('treats images without a hash as unique', () => {
    const ledger = new ExportSizeLedger();
    ledger.recordImage({ format: 'gif', originalBytes: 10, embeddedBytes: 20 });
    ledger.recordImage({ format: 'gif', originalBytes: 10, embeddedBytes: 20 });

    const report = ledger.finalize();

    expect(report.uniqueImages).toBe(2);
    expect(report.embeddedImageBytes).toBe(40);
    expect(report.deduplicationSavingBytes).toBe(0);
  });

  it('groups embedded bytes by format, sorted by size descending', () => {
    const ledger = new ExportSizeLedger();
    ledger.recordImage({ hash: 'a', format: 'png', originalBytes: 1, embeddedBytes: 100 });
    ledger.recordImage({ hash: 'b', format: 'webp', originalBytes: 1, embeddedBytes: 300 });
    ledger.recordImage({ hash: 'c', format: 'png', originalBytes: 1, embeddedBytes: 50 });

    const report = ledger.finalize();

    expect(report.imageFormats.map((entry) => entry.format)).toEqual(['webp', 'png']);
    expect(report.imageFormats[0].bytes).toBe(300);
    expect(report.imageFormats[1].bytes).toBe(150);
    expect(report.imageFormats[1].count).toBe(2);
  });

  it('separates note and image vault bytes', () => {
    const ledger = new ExportSizeLedger();
    ledger.recordNoteSource(100);
    ledger.recordNoteSource(200);
    ledger.recordImage({ hash: 'a', format: 'png', originalBytes: 400, embeddedBytes: 100 });

    const report = ledger.finalize();

    expect(report.noteCount).toBe(2);
    expect(report.vaultNoteBytes).toBe(300);
    expect(report.vaultImageBytes).toBe(400);
    expect(report.vaultOriginalBytes).toBe(700);
  });

  it('falls back to the raw size for the output size', () => {
    const ledger = new ExportSizeLedger();
    ledger.setRawBytes(1234);
    expect(ledger.finalize().outputBytes).toBe(1234);
  });

  it('reports the five largest artifacts sorted by size', () => {
    const ledger = new ExportSizeLedger();
    ledger.recordArtifact({ kind: 'note', original: 'small', exportType: 'HTML', bytes: 100 });
    ledger.recordArtifact({ kind: 'note', original: 'biggest', exportType: 'HTML', bytes: 600 });
    ledger.recordArtifact({ kind: 'image', original: 'photo.png', exportType: 'webp', bytes: 500 });
    ledger.recordArtifact({ kind: 'diagram', original: 'diagram.excalidraw', exportType: 'svg', bytes: 400 });
    ledger.recordArtifact({ kind: 'codeBlock', original: 'note', exportType: 'ts', bytes: 300 });
    ledger.recordArtifact({ kind: 'image', original: 'icon.svg', exportType: 'svg', bytes: 200 });

    const report = ledger.finalize();

    expect(report.largestArtifacts).toHaveLength(5);
    expect(report.largestArtifacts.map((artifact) => artifact.original)).toEqual([
      'biggest',
      'photo.png',
      'diagram.excalidraw',
      'note',
      'icon.svg',
    ]);
  });

  it('ignores zero-byte artifacts', () => {
    const ledger = new ExportSizeLedger();
    ledger.recordArtifact({ kind: 'note', original: 'empty', exportType: 'HTML', bytes: 0 });
    expect(ledger.finalize().largestArtifacts).toHaveLength(0);
  });

  it('passes compression metadata through', () => {
    const meta: CompressionMeta = {
      mode: 'gzipb85',
      rawBytes: 1000,
      compressedBytes: 200,
      encodedBytes: 250,
      outputBytes: 400,
      encodingOverheadBytes: 50,
    };
    const ledger = new ExportSizeLedger();
    ledger.setRawBytes(1000);
    ledger.setOutputBytes(400);
    ledger.setCompression(meta);

    expect(ledger.finalize().compression).toEqual(meta);
  });
});

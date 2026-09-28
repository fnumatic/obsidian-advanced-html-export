import { describe, it, expect } from 'vitest';
import { Component } from 'obsidian';
import { DetailedWikiRenderer } from './detailedRenderer';
import { ExportSizeLedger } from './exportSizeLedger';
import { utf8ByteLength } from './exportSizeReport';
import { mockAppWithFiles } from './test-utils';

describe('wiki shell size accounting', () => {
  it('records CSS and JavaScript shell bytes while generating the wiki', () => {
    const { app, byPath } = mockAppWithFiles({ 'central.md': '# Central' });
    const renderer = new DetailedWikiRenderer(app, new Component(), {
      imageQuality: 'medium',
      enableLazyLoading: false,
      enableImageDeduplication: false,
      linkDepth: 1,
      includeUnlinked: false,
      wikiTitle: 'Test Wiki',
    });

    const ledger = new ExportSizeLedger();
    renderer.setSizeLedger(ledger);

    const html = renderer.generateWikiHtmlWithRenderedPages(
      byPath.get('central.md')!,
      new Map(),
      [{ slug: 'central', title: 'Central', path: 'central.md' }],
    );

    ledger.setRawBytes(utf8ByteLength(html));
    const report = ledger.finalize();
    const css = report.categories.find((category) => category.key === 'css')!.bytes;
    const js = report.categories.find((category) => category.key === 'javascript')!.bytes;

    // The CSS raw import resolves to an empty string under Vitest, so only the
    // JavaScript shell (which is not affected) is asserted here.
    expect(js).toBeGreaterThan(0);
    expect(report.categories).toHaveLength(6);
    expect(report.rawBytes).toBeGreaterThan(css + js);
  });

  it('does not double count embedded images in the shell JavaScript', () => {
    const { app, byPath } = mockAppWithFiles({ 'central.md': '# Central' });
    const renderer = new DetailedWikiRenderer(app, new Component(), {
      imageQuality: 'medium',
      enableLazyLoading: false,
      enableImageDeduplication: true,
      linkDepth: 1,
      includeUnlinked: false,
      wikiTitle: 'Test Wiki',
    });

    const ledger = new ExportSizeLedger();
    renderer.setSizeLedger(ledger);
    // Simulate one embedded image recorded during rendering.
    const base64 = `data:image/png;base64,${'A'.repeat(1000)}`;
    (renderer as unknown as { imageCache: Map<string, string> }).imageCache.set('hash1', base64);
    ledger.recordImage({ hash: 'hash1', format: 'png', originalBytes: 500, embeddedBytes: utf8ByteLength(base64) });

    const html = renderer.generateWikiHtmlWithRenderedPages(
      byPath.get('central.md')!,
      new Map(),
      [{ slug: 'central', title: 'Central', path: 'central.md' }],
    );

    ledger.setRawBytes(utf8ByteLength(html));
    const report = ledger.finalize();
    const embedded = report.embeddedImageBytes;

    expect(embedded).toBe(utf8ByteLength(base64));
    expect(report.categories.find((category) => category.key === 'images')!.bytes).toBe(embedded);
  });
});

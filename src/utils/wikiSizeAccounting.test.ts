import { describe, it, expect } from 'vitest';
import { Component } from 'obsidian';
import { DetailedWikiRenderer } from './detailedRenderer';
import { ExportSizeLedger } from './exportSizeLedger';
import { utf8ByteLength } from './exportSizeReport';
import { mockAppWithFiles } from './test-utils';

type Report = ReturnType<ExportSizeLedger['finalize']>;

/** Exposes the shared image cache without reaching into the renderer by cast. */
class TestWikiRenderer extends DetailedWikiRenderer {
  /** Seeds the cache as if a page had embedded the image. */
  seedImage(hash: string, dataUri: string): void {
    this.imageCache.set(hash, dataUri);
  }
}

const pageList = [{ slug: 'central', title: 'Central', path: 'central.md' }];

function createRenderer(enableImageDeduplication: boolean) {
  const { app, byPath } = mockAppWithFiles({ 'central.md': '# Central' });
  const renderer = new TestWikiRenderer(app, new Component(), {
    imageQuality: 'medium',
    enableLazyLoading: false,
    enableImageDeduplication,
    linkDepth: 1,
    includeUnlinked: false,
    wikiTitle: 'Test Wiki',
  });
  return { renderer, byPath };
}

function generate(
  renderer: TestWikiRenderer,
  byPath: Map<string, import('obsidian').TFile>,
  seed?: { hash: string; dataUri: string },
): { html: string; report: Report } {
  const ledger = new ExportSizeLedger();
  renderer.setSizeLedger(ledger);

  if (seed) {
    renderer.seedImage(seed.hash, seed.dataUri);
    ledger.recordImage({
      hash: seed.hash,
      format: 'png',
      originalBytes: 500,
      embeddedBytes: utf8ByteLength(seed.dataUri),
    });
  }

  const html = renderer.generateWikiHtmlWithRenderedPages(
    byPath.get('central.md')!,
    new Map(),
    pageList,
  );

  ledger.setRawBytes(utf8ByteLength(html));
  return { html, report: ledger.finalize() };
}

const jsBytes = (report: Report): number =>
  report.categories.find((category) => category.key === 'javascript')!.bytes;

describe('wiki shell size accounting', () => {
  it('records CSS and JavaScript shell bytes while generating the wiki', () => {
    const { renderer, byPath } = createRenderer(false);
    const { report } = generate(renderer, byPath);
    const css = report.categories.find((category) => category.key === 'css')!.bytes;

    // The CSS raw import resolves to an empty string under Vitest, so only the
    // JavaScript shell (which is not affected) is asserted here.
    expect(jsBytes(report)).toBeGreaterThan(0);
    expect(report.categories).toHaveLength(6);
    expect(report.rawBytes).toBeGreaterThan(css + jsBytes(report));
  });

  it('does not double count embedded images in the shell JavaScript', () => {
    const dataUri = `data:image/png;base64,${'A'.repeat(1000)}`;
    const plain = createRenderer(true);
    const embedded = createRenderer(true);

    const withoutImage = generate(plain.renderer, plain.byPath);
    const withImage = generate(embedded.renderer, embedded.byPath, { hash: 'hash1', dataUri });

    // The shell measurement leaves out the image restoration payload, so adding
    // an image changes the document but not the JavaScript category.
    expect(jsBytes(withImage.report)).toBe(jsBytes(withoutImage.report));
    expect(withImage.html).toContain(dataUri);
    expect(withoutImage.html).not.toContain(dataUri);
    expect(withImage.report.embeddedImageBytes).toBe(utf8ByteLength(dataUri));
    expect(
      withImage.report.categories.find((category) => category.key === 'images')!.bytes,
    ).toBe(utf8ByteLength(dataUri));
  });
});

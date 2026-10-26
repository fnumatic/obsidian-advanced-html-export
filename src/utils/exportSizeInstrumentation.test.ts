// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { App, Component } from 'obsidian';
import HtmlRenderer from './htmlRenderer';
import {
  codeLabelFromNode,
  diagramLabelFromNode,
  extractDiagramSources,
  imageLabelFromPath,
  noteLabelFromPath,
} from './exportSizeInstrumentation';
import { ExportSizeLedger } from './exportSizeLedger';
import { utf8ByteLength } from './exportSizeReport';
import { installObsidianDom } from './test-utils';

// Mock ImageOptimizer
vi.mock('./imageOptimizer', () => ({
  ImageOptimizer: {
    optimizeImage: vi.fn(),
    getMimeType: vi.fn((format: string) => {
      const mimeTypes: Record<string, string> = {
        webp: 'image/webp',
        png: 'image/png',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
      };
      return mimeTypes[format.toLowerCase()] || 'application/octet-stream';
    }),
    isWebPSupported: vi.fn().mockReturnValue(true),
    generateImageHash: vi.fn(),
  },
}));

/** HTML the MarkdownRenderer mock injects into the render target. */
const rendered = vi.hoisted(() => ({ html: '' }));

vi.mock('obsidian', () => ({
  Component: class MockComponent {},
  MarkdownRenderer: {
    render: vi.fn(async (_app: unknown, _markdown: string, el: HTMLElement) => {
      el.innerHTML = rendered.html;
    }),
  },
  arrayBufferToBase64: vi.fn((buffer: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buffer))),
  ),
}));

/** Exposes the protected measurement hook without a type assertion. */
class TestRenderer extends HtmlRenderer {
  measure(el: Element, context?: { noteLabel?: string; diagramSources?: string[] }): void {
    this.measureContentSizes(el, context);
  }
}

function createElement(html: string): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element;
}

describe('size instrumentation', () => {
  let mockApp: {
    vault: {
      getFiles: Mock;
      adapter: { readBinary: Mock };
    };
  };
  let ledger: ExportSizeLedger;
  let renderer: TestRenderer;

  beforeEach(async () => {
    vi.clearAllMocks();
    rendered.html = '';
    installObsidianDom();
    document.body.innerHTML = '';

    const mockFile = {
      name: 'test.png',
      extension: 'png',
      path: 'test.png',
      stat: { mtime: 1234567890 },
    };
    mockApp = {
      vault: {
        getFiles: vi.fn().mockReturnValue([mockFile]),
        adapter: { readBinary: vi.fn().mockResolvedValue(new ArrayBuffer(8)) },
      },
    };

    const { ImageOptimizer } = await import('./imageOptimizer');
    vi.mocked(ImageOptimizer.generateImageHash).mockResolvedValue('hash1');
    vi.mocked(ImageOptimizer.optimizeImage).mockResolvedValue(new ArrayBuffer(4));

    ledger = new ExportSizeLedger();
    renderer = new TestRenderer(
      mockApp as unknown as App,
      {} as unknown as Component,
      { imageQuality: 'medium', enableLazyLoading: true, enableImageDeduplication: true },
    );
    renderer.setSizeLedger(ledger);
  });

  it('records embedded images with format and original source bytes', async () => {
    rendered.html = '<img src="app://test.png?1234567890">';

    await renderer.render('# Test');

    ledger.setRawBytes(10000);
    const report = ledger.finalize();

    expect(report.uniqueImages).toBe(1);
    expect(report.imageReferences).toBe(1);
    expect(report.imageFormats[0].format).toBe('webp');
    expect(report.embeddedImageBytes).toBeGreaterThan(0);
    expect(report.vaultImageBytes).toBe(8);

    const image = report.largestArtifacts.find((artifact) => artifact.kind === 'image');
    expect(image).toBeDefined();
    expect(image!.original).toBe('test.png');
    expect(image!.exportType).toBe('webp');
  });

  it('counts identical images as references and tracks the deduplication saving', async () => {
    rendered.html =
      '<img src="app://test.png?1234567890"><img src="app://test.png?1234567890">';

    await renderer.render('# Test');

    ledger.setRawBytes(10000);
    const report = ledger.finalize();

    expect(report.uniqueImages).toBe(1);
    expect(report.imageReferences).toBe(2);
    expect(report.deduplicationSavingBytes).toBeGreaterThan(0);
  });

  it('measures diagram and code block bytes from the rendered element', () => {
    const element = createElement(
      '<div class="excalidraw"><svg>diagram</svg></div><pre><code>hello</code></pre>',
    );
    const diagram = element.querySelector('.excalidraw')!;
    const pre = element.querySelector('pre')!;

    renderer.measure(element);

    ledger.setRawBytes(10000);
    const report = ledger.finalize();
    const diagrams = report.categories.find((category) => category.key === 'diagrams')!;
    const codeBlocks = report.categories.find((category) => category.key === 'codeBlocks')!;

    expect(diagrams.bytes).toBe(utf8ByteLength(diagram.outerHTML));
    expect(codeBlocks.bytes).toBe(utf8ByteLength(pre.outerHTML));

    const kinds = report.largestArtifacts.map((artifact) => artifact.kind);
    expect(kinds).toContain('diagram');
    expect(kinds).toContain('codeBlock');
  });

  it('labels diagram and code artifacts with their origin', () => {
    const element = createElement(
      '<div class="excalidraw" data-path="diagram.excalidraw">x</div>' +
        '<pre><code class="language-ts">x</code></pre>',
    );

    renderer.measure(element, { noteLabel: 'My Note' });

    ledger.setRawBytes(10000);
    const report = ledger.finalize();
    const diagramArtifact = report.largestArtifacts.find((artifact) => artifact.kind === 'diagram')!;
    const codeArtifact = report.largestArtifacts.find((artifact) => artifact.kind === 'codeBlock')!;

    expect(diagramArtifact.original).toBe('diagram.excalidraw');
    expect(diagramArtifact.exportType).toBe('svg');
    expect(codeArtifact.original).toBe('My Note');
    expect(codeArtifact.exportType).toBe('ts');
  });

  it('uses the embedded excalidraw file name when the DOM exposes no path', () => {
    const element = createElement('<div class="excalidraw">x</div>');

    renderer.measure(element, {
      noteLabel: 'how linux work',
      diagramSources: ['linux.excalidraw'],
    });

    ledger.setRawBytes(10000);
    const artifact = ledger.finalize().largestArtifacts.find((entry) => entry.kind === 'diagram')!;

    expect(artifact.original).toBe('linux.excalidraw');
    expect(artifact.exportType).toBe('svg');
  });

  it('keeps the diagram type as export type for non-Excalidraw diagrams', () => {
    const element = createElement('<div class="mermaid">x</div>');

    renderer.measure(element, { noteLabel: 'diagrams' });

    ledger.setRawBytes(10000);
    const artifact = ledger.finalize().largestArtifacts.find((entry) => entry.kind === 'diagram')!;

    expect(artifact.original).toBe('diagrams');
    expect(artifact.exportType).toBe('Mermaid');
  });

  it('extracts embedded excalidraw sources in document order', () => {
    const markdown =
      '![[a.excalidraw]] [[note]] ![[folder/b.excalidraw|B]] ![alt](image.png) ![[c.excalidraw#Section]]';
    expect(extractDiagramSources(markdown)).toEqual(['a.excalidraw', 'b.excalidraw', 'c.excalidraw']);
  });

  it('does not double count code blocks nested inside a diagram', () => {
    const element = createElement(
      '<div class="excalidraw"><svg><pre><code>x</code></pre></svg></div>',
    );

    renderer.measure(element);

    ledger.setRawBytes(10000);
    const report = ledger.finalize();
    expect(report.categories.find((category) => category.key === 'codeBlocks')!.bytes).toBe(0);
  });

  it('records nothing when no ledger is attached', () => {
    renderer.setSizeLedger(null);
    const element = createElement('<div class="excalidraw">x</div>');

    expect(() => renderer.measure(element)).not.toThrow();
  });
});

describe('size instrumentation helpers', () => {
  function classElement(className: string): Element {
    const element = document.createElement('div');
    element.className = className;
    return element;
  }

  it('labels diagram types from the container class list', () => {
    expect(diagramLabelFromNode(classElement('mermaid'))).toBe('Mermaid');
    expect(diagramLabelFromNode(classElement('block-language-plantuml'))).toBe('PlantUML');
    expect(diagramLabelFromNode(classElement('excalidraw'))).toBe('Excalidraw');
    expect(diagramLabelFromNode(classElement('block-language-graph'))).toBe('Graph');
    expect(diagramLabelFromNode(classElement('unknown'))).toBe('Diagram');
  });

  it('derives image labels from source paths', () => {
    expect(imageLabelFromPath('folder/photo.png')).toBe('photo.png');
    expect(imageLabelFromPath('app://photo.png?123')).toBe('photo.png');
    expect(imageLabelFromPath('my%20image.png')).toBe('my image.png');
    expect(imageLabelFromPath('data:image/png;base64,AAAA')).toBe('embedded image');
    expect(imageLabelFromPath('blob:abc')).toBe('embedded asset');
  });

  it('derives code languages from the nested code element', () => {
    const node = document.createElement('pre');
    node.innerHTML = '<code class="language-ts">x</code>';
    const plain = document.createElement('pre');
    expect(codeLabelFromNode(node)).toBe('ts');
    expect(codeLabelFromNode(plain)).toBe('Code');
  });

  it('derives note labels from source paths', () => {
    expect(noteLabelFromPath('folder/My Note.md')).toBe('My Note');
    expect(noteLabelFromPath('My Note')).toBe('My Note');
    expect(noteLabelFromPath('.')).toBeUndefined();
    expect(noteLabelFromPath(undefined)).toBeUndefined();
  });
});

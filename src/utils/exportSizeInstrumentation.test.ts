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

const mockBody = { createDiv: vi.fn() };
const mockDocument = { body: mockBody, createElement: vi.fn(() => ({})) };
Object.defineProperty(global, 'document', { value: mockDocument, writable: true });

vi.mock('obsidian', () => ({
  Component: class MockComponent {},
  MarkdownRenderer: { render: vi.fn() },
  arrayBufferToBase64: vi.fn((buffer: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buffer))),
  ),
}));

interface MockElement {
  querySelectorAll: (selector: string) => unknown[];
  innerHTML: string;
  remove?: () => void;
}

function createMockElement(parts: {
  images?: unknown[];
  pres?: unknown[];
  diagrams?: unknown[];
  innerHTML?: string;
}): MockElement {
  const images = parts.images ?? [];
  const pres = parts.pres ?? [];
  const diagrams = parts.diagrams ?? [];
  return {
    innerHTML: parts.innerHTML ?? '<p>content</p>',
    querySelectorAll: (selector: string) => {
      if (selector === '.copy-code-button') return [];
      if (selector === 'img') return images;
      if (selector === 'pre') return pres;
      return diagrams;
    },
  };
}

function createImage(src: string): { src: string; setAttribute: Mock } {
  const img = { src, setAttribute: vi.fn() };
  Object.defineProperty(img, 'src', { get: () => src, set: vi.fn() });
  return img;
}

describe('size instrumentation', () => {
  let mockApp: {
    vault: {
      getFiles: Mock;
      adapter: { readBinary: Mock };
    };
  };
  let ledger: ExportSizeLedger;
  let renderer: HtmlRenderer;

  beforeEach(async () => {
    vi.clearAllMocks();

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

    const { MarkdownRenderer } = await import('obsidian');
    (MarkdownRenderer.render as unknown as Mock).mockResolvedValue(undefined);

    const { ImageOptimizer } = await import('./imageOptimizer');
    vi.mocked(ImageOptimizer.generateImageHash).mockResolvedValue('hash1');
    vi.mocked(ImageOptimizer.optimizeImage).mockResolvedValue(new ArrayBuffer(4));

    ledger = new ExportSizeLedger();
    renderer = new HtmlRenderer(
      mockApp as unknown as App,
      {} as unknown as Component,
      { imageQuality: 'medium', enableLazyLoading: true, enableImageDeduplication: true },
    );
    renderer.setSizeLedger(ledger);
  });

  it('records embedded images with format and original source bytes', async () => {
    mockBody.createDiv.mockReturnValue(
      createMockElement({ images: [createImage('app://test.png?1234567890')] }) as unknown as HTMLElement,
    );

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
    mockBody.createDiv.mockReturnValue(
      createMockElement({
        images: [createImage('app://test.png?1234567890'), createImage('app://test.png?1234567890')],
      }) as unknown as HTMLElement,
    );

    await renderer.render('# Test');

    ledger.setRawBytes(10000);
    const report = ledger.finalize();

    expect(report.uniqueImages).toBe(1);
    expect(report.imageReferences).toBe(2);
    expect(report.deduplicationSavingBytes).toBeGreaterThan(0);
  });

  it('measures diagram and code block bytes from the rendered element', () => {
    const diagram = { outerHTML: '<svg>diagram</svg>', contains: () => false };
    const pre = { outerHTML: '<pre><code>hello</code></pre>' };
    const element = createMockElement({ diagrams: [diagram], pres: [pre] });

    (renderer as unknown as { measureContentSizes: (el: Element) => void })
      .measureContentSizes(element as unknown as Element);

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
    const diagram = {
      outerHTML: '<div class="excalidraw">x</div>',
      contains: () => false,
      getAttribute: (name: string) =>
        name === 'class' ? 'excalidraw' : name === 'data-path' ? 'diagram.excalidraw' : null,
      querySelectorAll: () => ({ forEach: () => {} }),
    };
    const code = {
      outerHTML: '<pre><code class="language-ts">x</code></pre>',
      querySelector: () => ({ getAttribute: () => 'language-ts' }),
    };
    const element = createMockElement({ diagrams: [diagram], pres: [code] });

    (renderer as unknown as {
      measureContentSizes: (el: Element, context?: { noteLabel?: string }) => void;
    }).measureContentSizes(element as unknown as Element, { noteLabel: 'My Note' });

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
    const diagram = {
      outerHTML: '<div class="excalidraw">x</div>',
      contains: () => false,
      getAttribute: (name: string) => (name === 'class' ? 'excalidraw' : null),
      querySelectorAll: () => ({ forEach: () => {} }),
    };
    const element = createMockElement({ diagrams: [diagram] });

    (renderer as unknown as {
      measureContentSizes: (el: Element, context?: { noteLabel?: string; diagramSources?: string[] }) => void;
    }).measureContentSizes(element as unknown as Element, {
      noteLabel: 'how linux work',
      diagramSources: ['linux.excalidraw'],
    });

    ledger.setRawBytes(10000);
    const artifact = ledger.finalize().largestArtifacts.find((entry) => entry.kind === 'diagram')!;

    expect(artifact.original).toBe('linux.excalidraw');
    expect(artifact.exportType).toBe('svg');
  });

  it('keeps the diagram type as export type for non-Excalidraw diagrams', () => {
    const diagram = {
      outerHTML: '<div class="mermaid">x</div>',
      contains: () => false,
      getAttribute: (name: string) => (name === 'class' ? 'mermaid' : null),
      querySelectorAll: () => ({ forEach: () => {} }),
    };
    const element = createMockElement({ diagrams: [diagram] });

    (renderer as unknown as {
      measureContentSizes: (el: Element, context?: { noteLabel?: string }) => void;
    }).measureContentSizes(element as unknown as Element, { noteLabel: 'diagrams' });

    ledger.setRawBytes(10000);
    const artifact = ledger.finalize().largestArtifacts.find((entry) => entry.kind === 'diagram')!;

    expect(artifact.original).toBe('diagrams');
    expect(artifact.exportType).toBe('Mermaid');
  });

  it('extracts embedded excalidraw sources in document order', () => {
    const markdown = '![[a.excalidraw]] [[note]] ![[folder/b.excalidraw|B]] ![alt](image.png) ![[c.excalidraw#Section]]';
    expect(extractDiagramSources(markdown)).toEqual(['a.excalidraw', 'b.excalidraw', 'c.excalidraw']);
  });

  it('does not double count code blocks nested inside a diagram', () => {
    const pre = { outerHTML: '<pre><code>x</code></pre>' };
    const diagram = { outerHTML: '<svg><pre><code>x</code></pre></svg>', contains: () => true };
    const element = createMockElement({ diagrams: [diagram], pres: [pre] });

    (renderer as unknown as { measureContentSizes: (el: Element) => void })
      .measureContentSizes(element as unknown as Element);

    ledger.setRawBytes(10000);
    const report = ledger.finalize();
    expect(report.categories.find((category) => category.key === 'codeBlocks')!.bytes).toBe(0);
  });

  it('records nothing when no ledger is attached', async () => {
    renderer.setSizeLedger(null);
    const diagram = { outerHTML: '<svg>diagram</svg>', contains: () => false };
    const element = createMockElement({ diagrams: [diagram] });

    expect(() =>
      (renderer as unknown as { measureContentSizes: (el: Element) => void })
        .measureContentSizes(element as unknown as Element),
    ).not.toThrow();
  });
});

describe('size instrumentation helpers', () => {
  const classElement = (className: string): Element =>
    ({ getAttribute: (name: string) => (name === 'class' ? className : null) }) as unknown as Element;

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
    const node = {
      querySelector: () => ({ getAttribute: () => 'language-ts' }),
    } as unknown as Element;
    const plain = { querySelector: () => null } as unknown as Element;
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

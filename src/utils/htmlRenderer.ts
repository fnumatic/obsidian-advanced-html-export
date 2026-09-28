import { App, arrayBufferToBase64, Component, MarkdownRenderer, TFile } from 'obsidian';
import { ImageOptimizer } from './imageOptimizer';
import { hideLanguageIdentifiers, restoreLanguageIdentifiers, parseLanguagesString } from './codeBlockProcessor';
import { ExportSizeLedger } from './exportSizeLedger';
import { utf8ByteLength } from './exportSizeReport';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'svg', 'webp'];
const MARKDOWN_RENDER_TIMEOUT_MS = 30000;
const TRANSPARENT_IMAGE_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Recognized diagram containers rendered by Obsidian or its diagram plugins.
 * The list is intentionally conservative: unmatched third-party renderers are
 * counted as note markup instead of being attributed incorrectly.
 */
const DIAGRAM_SELECTOR = [
  '.mermaid',
  '.block-language-mermaid',
  '.block-language-plantuml',
  '.block-language-graph',
  '.excalidraw',
  'svg.excalidraw-svg',
].join(',');

/** Derives a short format name from an embedded data URI. */
function formatFromDataUri(dataUri: string): string {
  const match = dataUri.match(/^data:([^;,]+)/);
  if (!match) return 'unknown';
  return match[1].replace(/^image\//, '').replace(/\+xml$/, '');
}

/** Derives a display label for an image source path. */
function imageLabelFromPath(imagePath: string): string {
  if (imagePath.startsWith('data:')) return 'embedded image';
  if (imagePath.startsWith('blob:')) return 'embedded asset';
  const last = imagePath.split('/').pop() ?? imagePath;
  const name = last.split('?')[0];
  try {
    return decodeURIComponent(name) || 'image';
  } catch {
    return name || 'image';
  }
}

/** Derives a diagram type label from a container's class list. */
function diagramLabelFromNode(node: Element): string {
  const className = node.getAttribute?.('class') ?? '';
  if (className.includes('mermaid')) return 'Mermaid';
  if (className.includes('plantuml')) return 'PlantUML';
  if (className.includes('excalidraw')) return 'Excalidraw';
  if (className.includes('graph')) return 'Graph';
  return 'Diagram';
}

/** Derives a language label from a code block element. */
function codeLabelFromNode(node: Element): string {
  const code = node.querySelector?.('code');
  const className = code?.getAttribute?.('class') ?? '';
  const match = className.match(/language-([\w-]+)/);
  return match ? match[1] : 'Code';
}

/** Derives a readable note label from a source path. */
export function noteLabelFromPath(sourcePath: string | undefined): string | undefined {
  if (!sourcePath || sourcePath === '.') return undefined;
  const file = sourcePath.split('/').pop() ?? sourcePath;
  const base = file.replace(/\.[^.]+$/, '');
  return base || undefined;
}

const EMBED_PATTERN = /!\[\[([^\]]+?)\]\]/g;
const DIAGRAM_SOURCE_PATTERN = /\.excalidraw$/i;

/**
 * Extracts the file names of embedded diagram source files (currently
 * `.excalidraw` embeds) from raw note markdown, in document order.
 * @param markdown Raw note markdown
 * @returns Embedded diagram file names
 */
export function extractDiagramSources(markdown: string): string[] {
  const sources: string[] = [];
  for (const match of markdown.matchAll(EMBED_PATTERN)) {
    const target = match[1].split('|')[0].split('#')[0].split('^')[0].trim();
    if (DIAGRAM_SOURCE_PATTERN.test(target)) {
      sources.push(target.split('/').pop() ?? target);
    }
  }
  return sources;
}

/**
 * Tries to read the embedded source path (e.g. a linked `.excalidraw` file)
 * from a diagram container or one of its descendants, if exposed in the DOM.
 */
function diagramSourceFromNode(node: Element): string | undefined {
  const attributes = ['data-path', 'data-src', 'data-href', 'data-file'];
  const candidates: Element[] = [node];
  const selector = attributes.map((attr) => `[${attr}]`).join(',');
  node.querySelectorAll?.(selector)?.forEach((child) => candidates.push(child));
  for (const candidate of candidates) {
    for (const attribute of attributes) {
      const value = candidate.getAttribute?.(attribute);
      if (value) return value;
    }
  }
  return undefined;
}

export interface RenderMarkdownResult {
  ok: boolean;
  error?: string;
  timedOut?: boolean;
}

export interface ImageHookContext {
  index: number;
  total: number;
  src: string;
}

export interface ImageProcessingHooks {
  beforeImage?: (ctx: ImageHookContext) => Promise<void> | void;
  beforeHash?: (ctx: ImageHookContext) => Promise<void> | void;
  beforeOptimize?: (ctx: ImageHookContext) => Promise<void> | void;
  afterImage?: (ctx: ImageHookContext) => Promise<void> | void;
}

interface ProcessedImage {
  hash: string;
  base64: string;
}

interface HtmlRendererSettings {
  imageQuality: 'high' | 'medium' | 'low';
  enableLazyLoading: boolean;
  enableImageDeduplication: boolean;
  disableSyntaxHighlighting?: boolean;
  syntaxHighlightLanguages?: string;
}

export default class HtmlRenderer {
  protected app: App;
  protected component: Component;
  protected settings: HtmlRendererSettings;
  protected imageCache: Map<string, string>;
  protected imageFiles: Map<string, TFile>;
  protected sizeLedger: ExportSizeLedger | null = null;
  /** Fallback label for diagram/code artifacts (e.g. the single-file note). */
  protected artifactLabel: string | null = null;

  constructor(app: App, component: Component, settings: HtmlRendererSettings, sharedImageCache?: Map<string, string>) {
    this.app = app;
    this.component = component;
    this.settings = settings;
    this.imageCache = sharedImageCache || new Map();
    this.imageFiles = this.initializeImageFiles();
  }

  /**
   * Attaches a size ledger that receives byte contributions while rendering.
   * @param ledger Ledger to feed, or null to disable accounting
   */
  setSizeLedger(ledger: ExportSizeLedger | null): void {
    this.sizeLedger = ledger;
  }

  /**
   * Sets a fallback label (usually the note name) used as the origin detail for
   * diagram and code block artifacts when no per-page label is available.
   * @param label Note name, or null to clear
   */
  setArtifactLabel(label: string | null): void {
    this.artifactLabel = label;
  }

  private initializeImageFiles(): Map<string, TFile> {
    const imageFiles = new Map<string, TFile>();

    try {
      const vault = this.app.vault;
      const files = vault.getFiles();

      if (!files) {
        return imageFiles;
      }

      for (const file of files) {
        if (IMAGE_EXTENSIONS.includes(file.extension.toLowerCase())) {
          imageFiles.set(file.name, file);
        }
      }
    } catch (error) {
      // Silent fail - image files map will be empty
    }

    return imageFiles;
  }

  /**
   * Parses a data: URL to extract the ArrayBuffer
   * @param dataUrl The data: URL string
   * @returns ArrayBuffer of the decoded data
   */
  protected parseDataUrlToBuffer(dataUrl: string): ArrayBuffer {
    const parts = dataUrl.split(',');
    if (parts.length !== 2 || !parts[0].startsWith('data:')) {
      throw new Error('Invalid data URL');
    }
    const base64 = parts[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Reads an image from any source URL (data:, blob:, app://, http(s)://)
   * and returns its buffer and MIME type.
   * Returns null for external http/https URLs (not embedded).
   */
  protected async readImageSource(imagePath: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
    if (imagePath.startsWith('data:')) {
      try {
        const buffer = this.parseDataUrlToBuffer(imagePath);
        const mimeMatch = imagePath.match(/^data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        return { buffer, mimeType };
      } catch {
        return null;
      }
    }

    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return null;
    }

    if (imagePath.startsWith('blob:')) {
      try {
        const response = await fetch(imagePath);
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const mimeType = blob.type || 'application/octet-stream';
        return { buffer, mimeType };
      } catch {
        return null;
      }
    }

    // app:// URLs or other Obsidian image paths
    const pathParts = imagePath.split('/');
    const fileNameWithTimestamp = pathParts[pathParts.length - 1];
    const paramParts = fileNameWithTimestamp?.split('?');
    const fileName = paramParts?.[0];
    const timestamp = paramParts?.[1];

    let file: TFile | undefined;

    if (fileName !== undefined && timestamp !== undefined) {
      file = this.imageFiles.get(decodeURIComponent(fileName));
      if (file && file.stat.mtime !== parseInt(timestamp)) {
        file = undefined;
      }
    }

    if (file === undefined) {
      return null;
    }

    const buffer = await this.app.vault.adapter.readBinary(decodeURIComponent(file.path));
    const mimeType = ImageOptimizer.getMimeType(file.extension);
    return { buffer, mimeType };
  }

  private async processImage(imagePath: string): Promise<ProcessedImage | null> {
    const source = await this.readImageSource(imagePath);
    if (!source) return null;

    const { buffer, mimeType } = source;
    const hash = await ImageOptimizer.generateImageHash(buffer);
    const originalBytes = buffer.byteLength;

    if (this.imageCache.has(hash)) {
      const cached = this.imageCache.get(hash)!;
      this.sizeLedger?.recordImage({
        hash,
        format: formatFromDataUri(cached),
        originalBytes,
        embeddedBytes: utf8ByteLength(cached),
      });
      return { hash, base64: cached };
    }

    let base64: string;
    try {
      const qualityMap = { high: 90, medium: 80, low: 70 };
      const quality = qualityMap[this.settings.imageQuality];
      const optimizedBuffer = await ImageOptimizer.optimizeImage(buffer, { quality, format: 'webp' });
      base64 = `data:${ImageOptimizer.getMimeType('webp')};base64,${arrayBufferToBase64(optimizedBuffer)}`;
    } catch {
      base64 = `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
    }

    this.imageCache.set(hash, base64);
    const format = formatFromDataUri(base64);
    this.sizeLedger?.recordImage({
      hash,
      format,
      originalBytes,
      embeddedBytes: utf8ByteLength(base64),
    });
    this.sizeLedger?.recordArtifact({
      kind: 'image',
      original: imageLabelFromPath(imagePath),
      exportType: format,
      bytes: utf8ByteLength(base64),
    });
    return { hash, base64 };
  }

  /**
   * Measures the bytes contributed by diagrams and code blocks in a rendered
   * element and records them in the size ledger.
   * @param el Rendered content element
   */
  protected measureContentSizes(
    el: Element,
    context: { noteLabel?: string; diagramSources?: string[] } = {},
  ): void {
    const ledger = this.sizeLedger;
    if (!ledger) return;

    const origin = context.noteLabel ?? this.artifactLabel ?? undefined;
    const diagramSources = [...(context.diagramSources ?? [])];

    const diagramNodes: Element[] = [];
    el.querySelectorAll(DIAGRAM_SELECTOR).forEach((node) => {
      if (!diagramNodes.some((matched) => matched.contains(node))) {
        diagramNodes.push(node);
      }
    });

    let diagramBytes = 0;
    for (const node of diagramNodes) {
      const bytes = utf8ByteLength(node.outerHTML ?? '');
      diagramBytes += bytes;

      const type = diagramLabelFromNode(node);
      const domSource = diagramSourceFromNode(node);
      const fallbackSource = type === 'Excalidraw' ? diagramSources.shift() : undefined;
      const rawSource = domSource ?? fallbackSource;
      const sourceName = rawSource ? (rawSource.split('/').pop() ?? rawSource) : undefined;

      // original: the source file, or the note it lives in. Excalidraw drawings
      // are exported as `svg`; other diagram engines keep their type as the
      // export type.
      ledger.recordArtifact({
        kind: 'diagram',
        original: sourceName ?? origin ?? '—',
        exportType: type === 'Excalidraw' ? 'svg' : type,
        bytes,
      });
    }
    ledger.recordDiagrams(diagramBytes);

    let codeBytes = 0;
    el.querySelectorAll('pre').forEach((node) => {
      if (diagramNodes.some((matched) => matched.contains(node))) return;
      const bytes = utf8ByteLength(node.outerHTML ?? '');
      codeBytes += bytes;
      ledger.recordArtifact({
        kind: 'codeBlock',
        original: origin ?? '—',
        exportType: codeLabelFromNode(node),
        bytes,
      });
    });
    ledger.recordCodeBlocks(codeBytes);
  }

  protected async convertImageToHash(imagePath: string): Promise<string> {
    return (await this.processImage(imagePath))?.hash ?? '';
  }

  protected async convertImageToBase64String(imagePath: string): Promise<string> {
    return (await this.processImage(imagePath))?.base64 ?? '';
  }



  /**
   * Renders markdown safely – isolates foreign postprocessor errors
   * so a crashed plugin doesn't abort the entire export.
   */
  protected async renderMarkdownSafely(content: string, el: HTMLElement, sourcePath: string): Promise<RenderMarkdownResult> {
    try {
      const renderPromise = MarkdownRenderer.render(this.app, content, el, sourcePath, this.component);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), MARKDOWN_RENDER_TIMEOUT_MS);
      });
      await Promise.race([renderPromise, timeoutPromise]);
      return { ok: true };
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'timeout';

      if (isTimeout) {
        console.warn(
          `renderMarkdownSafely: MarkdownRenderer.render timed out for sourcePath="${sourcePath}" after ${MARKDOWN_RENDER_TIMEOUT_MS}ms`,
        );
      } else {
        console.warn(
          `renderMarkdownSafely: MarkdownRenderer.render threw for sourcePath="${sourcePath}":`,
          error instanceof Error ? error.message : String(error),
        );
      }

      if (!el.innerHTML || el.innerHTML.trim() === '') {
        const escaped = content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        el.innerHTML = `<pre class="markdown-render-error-fallback">${escaped}</pre>`;
      }

      return {
        ok: false,
        error: isTimeout
          ? `MarkdownRenderer.render timed out after ${MARKDOWN_RENDER_TIMEOUT_MS}ms`
          : error instanceof Error ? error.message : String(error),
        ...(isTimeout ? { timedOut: true } : {}),
      };
    }
  }
  /**
   * Renders markdown content to HTML with embedded images
   * @param markdownContent The markdown content to render
   * @returns Promise resolving to HTML string
   * @security Uses innerHTML to read rendered output from Obsidian's MarkdownRenderer.
   * This is safe as we only read the output, not insert user input.
   * See: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#security
   */
  async render(markdownContent: string): Promise<string> {
    // Pre-process: hide language identifiers to prevent syntax highlighting
    const languages = parseLanguagesString(this.settings.syntaxHighlightLanguages || '');
    const processedContent = this.settings.disableSyntaxHighlighting !== false
      ? hideLanguageIdentifiers(markdownContent, languages)
      : markdownContent;
      
    const el = document.body.createDiv();
    await this.renderMarkdownSafely(processedContent, el, '.');

    // Post-process: restore language identifiers
    if (this.settings.disableSyntaxHighlighting !== false) {
      restoreLanguageIdentifiers(el);
    }

    // Remove copy-code buttons if they exist
    el.querySelectorAll('.copy-code-button').forEach(e => {
      e.remove();
    });

    this.measureContentSizes(el, {
      ...(this.artifactLabel ? { noteLabel: this.artifactLabel } : {}),
      diagramSources: extractDiagramSources(markdownContent),
    });

    let html: string;
    if (this.settings.enableImageDeduplication) {
      html = await this.renderWithDeduplication(el);
    } else {
      await this.renderWithoutDeduplication(el);
      html = el.innerHTML;
    }

    return html;
  }

  /**
   * Processes all images in an element sequentially, handling both dedup and non-dedup paths.
   */
  protected async processImagesInElement(
    el: Element,
    hooks?: ImageProcessingHooks,
    onImageProcessed?: (dedup: boolean, cacheHit: boolean) => void,
  ): Promise<void> {
    const imgElements = el.querySelectorAll('img');
    const total = imgElements.length;

    for (let i = 0; i < total; i++) {
      const img = imgElements[i];
      const src = img.src;
      if (!src) continue;

      const ctx: ImageHookContext = { index: i, total, src };
      await hooks?.beforeImage?.(ctx);

      if (this.settings.enableImageDeduplication) {
        await hooks?.beforeHash?.(ctx);
        const hash = await this.convertImageToHash(src);
        await hooks?.beforeOptimize?.(ctx);
        if (hash) {
          const cacheHit = this.imageCache.has(hash);
          img.setAttribute('data-hash', hash);
          img.setAttribute('src', TRANSPARENT_IMAGE_PLACEHOLDER);
          onImageProcessed?.(true, cacheHit);
        }
      } else {
        await hooks?.beforeOptimize?.(ctx);
        const base64 = await this.convertImageToBase64String(src);
        if (base64) {
          img.setAttribute('src', base64);
        }
        onImageProcessed?.(false, false);
      }

      if (this.settings.enableLazyLoading) {
        img.setAttribute('loading', 'lazy');
      }

      await hooks?.afterImage?.(ctx);
    }
  }

  /**
   * Renders with image deduplication using JavaScript embedding
   */
  protected async renderWithDeduplication(el: Element): Promise<string> {
    await this.processImagesInElement(el);

    const imagesObject: Record<string, string> = {};
    for (const [hash, base64] of this.imageCache) {
      imagesObject[hash] = base64;
    }

    const scriptContent = `
      var images = ${JSON.stringify(imagesObject)};
      document.querySelectorAll('img[data-hash]').forEach(function(img) {
        img.src = images[img.dataset.hash];
      });
    `;
    return el.innerHTML + `<script>${scriptContent}</script>`;
  }

  /**
   * Renders without deduplication using direct base64 embedding
   */
  protected async renderWithoutDeduplication(el: Element): Promise<void> {
    await this.processImagesInElement(el);
  }
}
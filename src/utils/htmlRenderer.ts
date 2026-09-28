import { App, Component, MarkdownRenderer } from 'obsidian';
import { hideLanguageIdentifiers, restoreLanguageIdentifiers, parseLanguagesString } from './codeBlockProcessor';
import { ExportSizeLedger } from './exportSizeLedger';
import { utf8ByteLength } from './exportSizeReport';
import type { AdvancedHtmlExportSettings } from '../settings';
import {
  codeLabelFromNode,
  diagramLabelFromNode,
  diagramSourceFromNode,
  DIAGRAM_SELECTOR,
  extractDiagramSources,
} from './exportSizeInstrumentation';
import { ImageEmbedder } from './imageEmbedder';
import type { ImageProcessingHooks } from './imageEmbedder';

export type { ImageHookContext, ImageProcessingHooks } from './imageEmbedder';

const MARKDOWN_RENDER_TIMEOUT_MS = 30000;

export interface RenderMarkdownResult {
  ok: boolean;
  error?: string;
  timedOut?: boolean;
}

type HtmlRendererSettings = Pick<
  AdvancedHtmlExportSettings,
  'imageQuality' | 'enableLazyLoading' | 'enableImageDeduplication'
> &
  Partial<Pick<AdvancedHtmlExportSettings, 'disableSyntaxHighlighting' | 'syntaxHighlightLanguages'>>;

export default class HtmlRenderer {
  protected app: App;
  protected component: Component;
  protected settings: HtmlRendererSettings;
  protected embedder: ImageEmbedder;
  protected sizeLedger: ExportSizeLedger | null = null;

  constructor(app: App, component: Component, settings: HtmlRendererSettings, sharedImageCache?: Map<string, string>) {
    this.app = app;
    this.component = component;
    this.settings = settings;
    this.embedder = new ImageEmbedder(app, settings, sharedImageCache);
  }

  /** Content-hash to data-URI cache owned by the image embedder. */
  protected get imageCache(): Map<string, string> {
    return this.embedder.getCache();
  }

  /**
   * Attaches a size ledger that receives byte contributions while rendering.
   * @param ledger Ledger to feed, or null to disable accounting
   */
  setSizeLedger(ledger: ExportSizeLedger | null): void {
    this.sizeLedger = ledger;
    this.embedder.setSizeLedger(ledger);
  }

  protected async convertImageToHash(imagePath: string): Promise<string> {
    return this.embedder.convertImageToHash(imagePath);
  }

  protected async convertImageToBase64String(imagePath: string): Promise<string> {
    return this.embedder.convertImageToBase64String(imagePath);
  }

  /**
   * Measures the bytes contributed by diagrams and code blocks in a rendered
   * element and records them (plus the individual artifacts) in the size ledger.
   * @param el Rendered content element
   * @param context Note label and embedded diagram sources for artifact labels
   */
  protected measureContentSizes(
    el: Element,
    context: { noteLabel?: string; diagramSources?: string[] } = {},
  ): void {
    const ledger = this.sizeLedger;
    if (!ledger) return;

    const origin = context.noteLabel ?? undefined;
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
   * @param noteLabel Optional note label used for diagram/code artifact origins
   * @returns Promise resolving to HTML string
   * @security Uses innerHTML to read rendered output from Obsidian's MarkdownRenderer.
   * This is safe as we only read the output, not insert user input.
   * See: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#security
   */
  async render(markdownContent: string, noteLabel?: string): Promise<string> {
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
      ...(noteLabel ? { noteLabel } : {}),
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

  /** Processes all images in an element (delegates to the image embedder). */
  protected async processImagesInElement(
    el: Element,
    hooks?: ImageProcessingHooks,
    onImageProcessed?: (dedup: boolean, cacheHit: boolean) => void,
  ): Promise<void> {
    return this.embedder.processImagesInElement(el, hooks, onImageProcessed);
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

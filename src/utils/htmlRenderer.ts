import { App, arrayBufferToBase64, Component, MarkdownRenderer, TFile } from 'obsidian';
import { ImageOptimizer } from './imageOptimizer';
import { hideLanguageIdentifiers, restoreLanguageIdentifiers, parseLanguagesString } from './codeBlockProcessor';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'svg', 'webp'];
const MARKDOWN_RENDER_TIMEOUT_MS = 30000;

export interface RenderMarkdownResult {
  ok: boolean;
  error?: string;
  timedOut?: boolean;
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

  constructor(app: App, component: Component, settings: HtmlRendererSettings, sharedImageCache?: Map<string, string>) {
    this.app = app;
    this.component = component;
    this.settings = settings;
    this.imageCache = sharedImageCache || new Map();
    this.imageFiles = this.initializeImageFiles();
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

    if (this.imageCache.has(hash)) {
      return { hash, base64: this.imageCache.get(hash)! };
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
    return { hash, base64 };
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
   * Renders with image deduplication using JavaScript embedding
   */
  protected async renderWithDeduplication(el: Element): Promise<string> {
    const imgElements = el.querySelectorAll('img');
    const imagePromises = Array.from(imgElements).map(async (img) => {
      const src = img.src;
      if (src && src !== null && src !== undefined) {
        const hash = await this.convertImageToHash(src);
        if (hash) {
          img.setAttribute('data-hash', hash);
          // Replace src with placeholder to prevent browser errors
          img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
        }
        if (this.settings.enableLazyLoading) {
          img.setAttribute('loading', 'lazy');
        }
      }
    });

    await Promise.all(imagePromises);

    // Get HTML with placeholders
    let html = el.innerHTML;

    // Create images object
    const imagesObject: Record<string, string> = {};
    for (const [hash, base64] of this.imageCache) {
      imagesObject[hash] = base64;
    }

    // Append script as string to avoid execution during export
    const scriptContent = `
      var images = ${JSON.stringify(imagesObject)};
      document.querySelectorAll('img[data-hash]').forEach(function(img) {
        img.src = images[img.dataset.hash];
      });
    `;
    html += `<script>${scriptContent}</script>`;

    return html;
  }

  /**
   * Renders without deduplication using direct base64 embedding
   */
  protected async renderWithoutDeduplication(el: Element): Promise<void> {
    const imgElements = el.querySelectorAll('img');
    const imagePromises = Array.from(imgElements).map(async (img) => {
      const src = img.src;
      if (src && src !== null && src !== undefined) {
        const base64 = await this.convertImageToBase64String(src);
        if (base64) {
          img.setAttribute('src', base64);
        }
        if (this.settings.enableLazyLoading) {
          img.setAttribute('loading', 'lazy');
        }
      }
    });

    await Promise.all(imagePromises);
  }
}
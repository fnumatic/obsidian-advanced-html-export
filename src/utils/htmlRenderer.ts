import { App, arrayBufferToBase64, Component, MarkdownRenderer, TFile } from 'obsidian';
import { ImageOptimizer } from './imageOptimizer';
import { hideLanguageIdentifiers, restoreLanguageIdentifiers, parseLanguagesString } from './codeBlockProcessor';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'svg', 'webp'];

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
   * Converts an image path to hash for deduplication
   * @param imagePath The image path as returned by the MarkdownRenderer
   * @returns The hash of the optimized image or empty string if not found
   */
  protected async convertImageToHash(imagePath: string): Promise<string> {
    let buffer: ArrayBuffer;
    let mimeType: string;

    if (imagePath.startsWith('data:')) {
      // Parse data: URL
      try {
        buffer = this.parseDataUrlToBuffer(imagePath);
        const mimeMatch = imagePath.match(/^data:([^;]+)/);
        mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      } catch (error) {
        return '';
      }
    } else if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      // External URL - skip for now
      return '';
    } else if (imagePath.startsWith('blob:')) {
      // Blob URLs (e.g., from Excalidraw) - cannot be processed as they are temporary browser URLs
      return '';
    } else {
      // Existing logic for app:// URLs - use cached image files map
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
        return '';
      }
      buffer = await this.app.vault.adapter.readBinary(decodeURIComponent(file.path));
      mimeType = ImageOptimizer.getMimeType(file.extension);
    }

    // Generate hash for deduplication
    const imageHash = await ImageOptimizer.generateImageHash(buffer);

    // Check cache first
    if (this.imageCache.has(imageHash)) {
      return imageHash;
    }

    let optimizedBase64: string;

    try {
      // Optimize the image
      const qualityMap = { high: 90, medium: 80, low: 70 };
      const quality = qualityMap[this.settings.imageQuality];
      const optimizedBuffer = await ImageOptimizer.optimizeImage(buffer, {
        quality,
        format: 'webp'
      });

      const optimizedMimeType = ImageOptimizer.getMimeType('webp');
      optimizedBase64 = `data:${optimizedMimeType};base64,${arrayBufferToBase64(optimizedBuffer)}`;
    } catch (error) {
      // Fallback to original image
      optimizedBase64 = `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
    }

    // Cache the result
    this.imageCache.set(imageHash, optimizedBase64);

    return imageHash;
  }

  /**
   * Converts an image path to optimized base64 string for embedding
   * @param imagePath The image path as returned by the MarkdownRenderer
   * @returns The base64 representation of the optimized image or empty string if not found
   */
  protected async convertImageToBase64String(imagePath: string): Promise<string> {
    let buffer: ArrayBuffer;
    let mimeType: string;

    if (imagePath.startsWith('data:')) {
      // Parse data: URL
      try {
        buffer = this.parseDataUrlToBuffer(imagePath);
        const mimeMatch = imagePath.match(/^data:([^;]+)/);
        mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      } catch (error) {
        return '';
      }
    } else {
      // Existing logic for app:// URLs - use cached image files map
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
        return '';
      }

      buffer = await this.app.vault.adapter.readBinary(decodeURIComponent(file.path));
      mimeType = ImageOptimizer.getMimeType(file.extension);
    }

    // Generate hash for deduplication
    const imageHash = await ImageOptimizer.generateImageHash(buffer);

    // Check cache first
    if (this.imageCache.has(imageHash)) {
      return this.imageCache.get(imageHash)!;
    }

    let optimizedBase64: string;

    try {
      // Optimize the image
      const qualityMap = { high: 90, medium: 80, low: 70 };
      const quality = qualityMap[this.settings.imageQuality];
      const optimizedBuffer = await ImageOptimizer.optimizeImage(buffer, {
        quality,
        format: 'webp'
      });

      const optimizedMimeType = ImageOptimizer.getMimeType('webp');
      optimizedBase64 = `data:${optimizedMimeType};base64,${arrayBufferToBase64(optimizedBuffer)}`;
    } catch (error) {
      // Fallback to original image
      optimizedBase64 = `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
    }

    // Cache the result
    this.imageCache.set(imageHash, optimizedBase64);

    return optimizedBase64;
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
    await MarkdownRenderer.render(this.app, processedContent, el, '.', this.component);

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
        img.setAttribute('data-hash', hash);
        // Replace src with placeholder to prevent browser errors
        img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
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
        img.setAttribute('src', await this.convertImageToBase64String(src));
        if (this.settings.enableLazyLoading) {
          img.setAttribute('loading', 'lazy');
        }
      }
    });

    await Promise.all(imagePromises);
  }
}
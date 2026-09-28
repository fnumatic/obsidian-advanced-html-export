/**
 * Reads, optimizes and embeds images for an export.
 *
 * Owns the source lookup (vault files, `app://`, `blob:` and data URLs), the
 * content-hash cache used for deduplication, and the related size accounting.
 */

import { App, arrayBufferToBase64, TFile } from 'obsidian';
import { ImageOptimizer } from './imageOptimizer';
import { ExportSizeLedger } from './exportSizeLedger';
import { utf8ByteLength } from './exportSizeReport';
import { formatFromDataUri, imageLabelFromPath } from './exportSizeInstrumentation';
import type { AdvancedHtmlExportSettings } from '../settings';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'svg', 'webp'];
const TRANSPARENT_IMAGE_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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

type ImageEmbedderSettings = Pick<
  AdvancedHtmlExportSettings,
  'imageQuality' | 'enableLazyLoading' | 'enableImageDeduplication'
>;

export class ImageEmbedder {
  private readonly imageCache: Map<string, string>;
  private readonly imageFiles: Map<string, TFile>;
  private sizeLedger: ExportSizeLedger | null = null;

  constructor(
    private readonly app: App,
    private readonly settings: ImageEmbedderSettings,
    sharedImageCache?: Map<string, string>,
  ) {
    this.imageCache = sharedImageCache || new Map();
    this.imageFiles = this.initializeImageFiles();
  }

  /** Attaches a size ledger that receives image byte contributions. */
  setSizeLedger(ledger: ExportSizeLedger | null): void {
    this.sizeLedger = ledger;
  }

  /** Content-hash to data-URI cache, keyed by image hash. */
  getCache(): Map<string, string> {
    return this.imageCache;
  }

  private initializeImageFiles(): Map<string, TFile> {
    const imageFiles = new Map<string, TFile>();

    try {
      const files = this.app.vault.getFiles();
      if (!files) {
        return imageFiles;
      }

      for (const file of files) {
        if (IMAGE_EXTENSIONS.includes(file.extension.toLowerCase())) {
          imageFiles.set(file.name, file);
        }
      }
    } catch {
      // Silent fail - image files map will be empty
    }

    return imageFiles;
  }

  /**
   * Parses a data: URL to extract the ArrayBuffer
   * @param dataUrl The data: URL string
   * @returns ArrayBuffer of the decoded data
   */
  private parseDataUrlToBuffer(dataUrl: string): ArrayBuffer {
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
  private async readImageSource(imagePath: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
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

  async convertImageToHash(imagePath: string): Promise<string> {
    return (await this.processImage(imagePath))?.hash ?? '';
  }

  async convertImageToBase64String(imagePath: string): Promise<string> {
    return (await this.processImage(imagePath))?.base64 ?? '';
  }

  /**
   * Processes all images in an element sequentially, handling both dedup and
   * non-dedup paths.
   */
  async processImagesInElement(
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
}

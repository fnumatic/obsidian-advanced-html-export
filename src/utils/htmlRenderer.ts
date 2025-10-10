import { App, arrayBufferToBase64, Component, MarkdownRenderer, TFile } from 'obsidian';
import { ImageOptimizer } from './imageOptimizer';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'svg', 'webp'];

interface HtmlRendererSettings {
  imageQuality: 'high' | 'medium' | 'low';
  enableLazyLoading: boolean;
}

export default class HtmlRenderer {
  private app: App;
  private component: Component;
  private settings: HtmlRendererSettings;
  private imageCache: Map<string, string> = new Map();

  constructor (app: App, component: Component, settings: HtmlRendererSettings) {
    this.app = app;
    this.component = component;
    this.settings = settings;
  }

  /**
   * Converts an image path to optimized base64 string for embedding
   * @param imagePath The image path as returned by the MarkdownRenderer
   * @returns The base64 representation of the optimized image or empty string if not found
   */
  private async convertImageToBase64String (imagePath: string): Promise<string> {
    const vault = this.app.vault;
    const images = vault.getFiles().filter(file => IMAGE_EXTENSIONS.includes(file.extension.toLowerCase()));

    const pathParts = imagePath.split('/');
    const fileNameWithTimestamp = pathParts[pathParts.length - 1];
    const paramParts = fileNameWithTimestamp?.split('?');
    const fileName = paramParts?.[0];
    const timestamp = paramParts?.[1];

    let file: TFile | undefined;

    for (const image of images) {
      if (fileName !== undefined && timestamp !== undefined && image.name === decodeURIComponent(fileName) && image.stat.mtime === parseInt(timestamp)) {
        file = image;
        break;
      }
    }

    if (file === undefined) {
      console.warn(`Could not find image [${imagePath}]. Skipping.`);
      return '';
    }

    const buffer = await vault.adapter.readBinary(decodeURIComponent(file.path));

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

      const mimeType = ImageOptimizer.getMimeType('webp');
      optimizedBase64 = `data:${mimeType};base64,${arrayBufferToBase64(optimizedBuffer)}`;
    } catch (error) {
      console.warn(`Failed to optimize image ${file.path}, using original:`, error);
      // Fallback to original image
      const mimeType = ImageOptimizer.getMimeType(file.extension);
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
   */
  async render (markdownContent: string): Promise<string> {
    const el = document.body.createDiv();
    await MarkdownRenderer.render(this.app, markdownContent, el, '.', this.component);

    // Remove copy-code buttons if they exist
    el.querySelectorAll('.copy-code-button').forEach(e => {
      e.remove();
    });

    // Convert images to base64 strings
    const imgElements = el.querySelectorAll('img');
    const imagePromises = Array.from(imgElements).map(async (img) => {
      const src = img.src;
      if (src && src !== null && src !== undefined) {
        img.src = await this.convertImageToBase64String(src);
        if (this.settings.enableLazyLoading) {
          img.setAttribute('loading', 'lazy');
        }
      }
    });

    // Wait for all images to be processed
    await Promise.all(imagePromises);

    // Small delay to ensure DOM updates are complete
    await new Promise((resolve) => {
      setTimeout(() => resolve(null), 50);
    });

    return el.innerHTML;
  }
}
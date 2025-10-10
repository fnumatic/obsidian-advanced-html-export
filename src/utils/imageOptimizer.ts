export interface ImageOptimizationOptions {
  quality: number; // 1-100
  format: 'webp' | 'jpeg' | 'png';
}

export class ImageOptimizer {
  /**
   * Generates a SHA-256 hash of the image buffer for deduplication
   * @param buffer The image buffer
   * @returns Promise resolving to hex string hash
   */
  static async generateImageHash(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Checks if WebP format is supported by the browser
   * @returns True if WebP is supported
   */
  static isWebPSupported(): boolean {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      ctx.fillRect(0, 0, 1, 1);
      const dataURL = canvas.toDataURL('image/webp');
      return dataURL.startsWith('data:image/webp');
    } catch {
      return false;
    }
  }

  /**
   * Optimizes an image buffer using Canvas API
   * @param buffer The original image buffer
   * @param options Optimization options
   * @returns Promise resolving to optimized buffer
   */
  static async optimizeImage(buffer: ArrayBuffer, options: ImageOptimizationOptions): Promise<ArrayBuffer> {
    // Create a blob from the buffer
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);

    // Load the image
    const img = new Image();
    img.src = url;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
    });

    // Check if image loaded successfully
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      throw new Error('Image failed to load or has no dimensions');
    }

    // Create canvas and draw the image
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Check WebP support if requested
    if (options.format === 'webp' && !this.isWebPSupported()) {
      throw new Error('WebP format not supported by browser');
    }

    // Convert to blob with specified format and quality
    const mimeType = this.getMimeType(options.format);
    const quality = options.quality / 100; // Canvas expects 0-1

    const optimizedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Blob creation failed'));
        }
      }, mimeType, quality);
    });

    // Clean up
    URL.revokeObjectURL(url);

    // Convert blob to ArrayBuffer
    return await optimizedBlob.arrayBuffer();
  }

  /**
   * Gets the MIME type for the optimized format
   * @param format The image format
   * @returns MIME type string
   */
  static getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      'webp': 'image/webp',
      'jpeg': 'image/jpeg',
      'jpg': 'image/jpeg',
      'png': 'image/png'
    };
    return mimeTypes[format.toLowerCase()] || 'application/octet-stream';
  }
}
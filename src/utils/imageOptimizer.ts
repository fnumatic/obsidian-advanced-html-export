export interface ImageOptimizationOptions {
  quality: number; // 1-100
  format: 'webp' | 'jpeg' | 'png';
}

export class ImageOptimizer {
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

    // Create canvas and draw the image
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Convert to blob with specified format and quality
    const mimeType = this.getMimeType(options.format);
    const quality = options.quality / 100; // Canvas expects 0-1

    const optimizedBlob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(resolve, mimeType, quality);
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
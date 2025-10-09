/**
 * Utility functions for file operations
 */

/**
 * Downloads a blob as a file
 * @param blob The blob to download
 * @param filename The filename for the download
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Sanitizes a filename by removing invalid characters
 * @param filename The original filename
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}

/**
 * Generates a safe filename from a file path
 * @param filePath The file path
 * @param extension The desired extension (without dot)
 * @returns Safe filename with extension
 */
export function generateSafeFilename(filePath: string, extension: string = 'html'): string {
  const baseName = filePath.split('/').pop()?.split('.')[0] || 'untitled';
  const sanitized = sanitizeFilename(baseName);
  return `${sanitized}.${extension}`;
}
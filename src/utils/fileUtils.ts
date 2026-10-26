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

/** Default timestamp layout used in export filenames. */
export const DEFAULT_TIMESTAMP_FORMAT = 'YYYY-MM-DD_HH-mm-ss';

const TIMESTAMP_TOKENS: Record<string, (date: Date) => string> = {
  YYYY: (date) => String(date.getFullYear()),
  YY: (date) => String(date.getFullYear()).slice(-2),
  MM: (date) => String(date.getMonth() + 1).padStart(2, '0'),
  DD: (date) => String(date.getDate()).padStart(2, '0'),
  HH: (date) => String(date.getHours()).padStart(2, '0'),
  mm: (date) => String(date.getMinutes()).padStart(2, '0'),
  ss: (date) => String(date.getSeconds()).padStart(2, '0'),
};

const TIMESTAMP_TOKEN_PATTERN = /YYYY|YY|MM|DD|HH|mm|ss/g;

/**
 * Formats a timestamp for filenames using `YYYY`, `YY`, `MM`, `DD`, `HH`,
 * `mm` and `ss` tokens, e.g. `YYYY-MM-DD_HH-mm-ss`.
 * Uses local time; other characters are kept as literals.
 */
export function formatTimestamp(date: Date = new Date(), format: string = DEFAULT_TIMESTAMP_FORMAT): string {
  return format.replace(TIMESTAMP_TOKEN_PATTERN, (token) => TIMESTAMP_TOKENS[token](date));
}

/**
 * Inserts a timestamp before the extension so repeated exports do not
 * overwrite each other: `note.html` becomes `note-2026-10-26_16-30-05.html`.
 * Characters that are invalid in filenames are replaced.
 */
export function appendTimestamp(
  filename: string,
  format: string = DEFAULT_TIMESTAMP_FORMAT,
  date: Date = new Date(),
): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  const stamp = sanitizeFilename(formatTimestamp(date, format));
  return `${stem}-${stamp}${extension}`;
}

/** Controls the optional timestamp in generated export filenames. */
export interface FilenameOptions {
  /** Timestamp format; `false` disables the timestamp. Default: `DEFAULT_TIMESTAMP_FORMAT`. */
  timestamp?: string | false;
  /** Timestamp to use. Default: now. */
  date?: Date;
}

function finalizeFilename(filename: string, options: FilenameOptions): string {
  if (options.timestamp === false) return filename;
  return appendTimestamp(filename, options.timestamp ?? DEFAULT_TIMESTAMP_FORMAT, options.date);
}

/**
 * Generates a safe filename from a file path
 * @param filePath The file path
 * @param extension The desired extension (without dot)
 * @param options Timestamp behavior and timestamp to use
 * @returns Safe filename with extension
 */
export function generateSafeFilename(
  filePath: string,
  extension: string = 'html',
  options: FilenameOptions = {},
): string {
  const baseName = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'untitled';
  const sanitized = sanitizeFilename(baseName);
  return finalizeFilename(`${sanitized}.${extension}`, options);
}

/**
 * Generates the filename for a wiki export, e.g. `Home-wiki-2026-10-26_16-30-05.html`.
 * @param filePath Path of the start note
 * @param options Timestamp behavior and timestamp to use
 */
export function generateWikiFilename(filePath: string, options: FilenameOptions = {}): string {
  const baseName = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
  const stem = baseName ? `${sanitizeFilename(baseName)}-wiki` : 'wiki';
  return finalizeFilename(`${stem}.html`, options);
}
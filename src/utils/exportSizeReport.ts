/**
 * Data model for the export size statistics overview.
 *
 * A report describes how the bytes of a generated export are distributed across
 * mutually exclusive categories (note markup, images, diagrams, code blocks,
 * CSS, JavaScript), how the embedded images are distributed across formats, how
 * the export compares to the original vault data, and how compression affected
 * the final file.
 */

import type { CompressionMeta } from './selfExtract';

/** Mutually exclusive size buckets of the uncompressed HTML. */
export type SizeCategoryKey =
  | 'noteMarkup'
  | 'images'
  | 'diagrams'
  | 'codeBlocks'
  | 'css'
  | 'javascript';

/** Display order of the categories. */
export const SIZE_CATEGORY_ORDER: SizeCategoryKey[] = [
  'noteMarkup',
  'images',
  'diagrams',
  'codeBlocks',
  'css',
  'javascript',
];

/** Human readable labels for the categories. */
export const SIZE_CATEGORY_LABELS: Record<SizeCategoryKey, string> = {
  noteMarkup: 'Note markup',
  images: 'Images',
  diagrams: 'Diagrams',
  codeBlocks: 'Code blocks',
  css: 'CSS',
  javascript: 'JavaScript',
};

export interface SizeCategory {
  key: SizeCategoryKey;
  bytes: number;
  /** Fraction of the uncompressed HTML (0..1). */
  share: number;
}

export interface ImageFormatSize {
  format: string;
  bytes: number;
  count: number;
}

/** Kind of an individual size contributor. */
export type ArtifactKind = 'note' | 'image' | 'diagram' | 'codeBlock';

/** Human readable labels for artifact kinds. */
export const ARTIFACT_KIND_LABELS: Record<ArtifactKind, string> = {
  note: 'Note',
  image: 'Image',
  diagram: 'Diagram',
  codeBlock: 'Code',
};

/** One individual size contributor (a note, image, diagram or code block). */
export interface SizeArtifact {
  kind: ArtifactKind;
  /** Name of the original artifact: file name, note title or source note. */
  original: string;
  /** Type as it appears in the export: image format, diagram type, code language. */
  exportType: string;
  /** Bytes the artifact occupies in the export. */
  bytes: number;
}

export interface ExportSizeReport {
  /** Bytes of the uncompressed HTML document. */
  rawBytes: number;
  /** Bytes of the file that was written to disk (may be compressed). */
  outputBytes: number;
  /** Mutually exclusive categories that sum to `rawBytes`. */
  categories: SizeCategory[];
  /** Embedded image bytes grouped by format, sorted by size descending. */
  imageFormats: ImageFormatSize[];
  /** Original bytes of the notes in the vault. */
  vaultNoteBytes: number;
  /** Original bytes of the referenced image/asset source files. */
  vaultImageBytes: number;
  /** Original vault bytes in total (notes + referenced files). */
  vaultOriginalBytes: number;
  /** Image bytes embedded in the export. */
  embeddedImageBytes: number;
  /** Number of image references encountered while rendering. */
  imageReferences: number;
  /** Number of unique images embedded. */
  uniqueImages: number;
  /** Bytes avoided by embedding identical images only once. */
  deduplicationSavingBytes: number;
  /** Number of notes included in the export. */
  noteCount: number;
  /** The largest individual artifacts, sorted by size descending. */
  largestArtifacts: SizeArtifact[];
  /** Compression metadata, present when the export was wrapped. */
  compression?: CompressionMeta;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/**
 * Formats a byte count in binary units (1024) with one decimal place.
 * @param bytes Byte count (values <= 0 format as "0 B")
 * @returns Human readable size such as "1.5 MB"
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${Math.round(value)} B` : `${value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

const byteEncoder = new TextEncoder();

/**
 * Returns the UTF-8 byte length of a string (not the UTF-16 code unit count).
 * @param value Input string
 * @returns Number of UTF-8 bytes
 */
export function utf8ByteLength(value: string): number {
  return byteEncoder.encode(value).length;
}

const DATA_URI_PATTERN = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi;

/**
 * Sums the UTF-8 bytes of all inline base64 data URIs in an HTML fragment.
 * Used to keep embedded images from being counted twice when ranking notes.
 * @param html HTML fragment
 * @returns Total byte length of the inline data URIs
 */
export function inlineDataUriBytes(html: string): number {
  const matches = html.match(DATA_URI_PATTERN);
  if (!matches) return 0;
  let total = 0;
  for (const match of matches) {
    total += utf8ByteLength(match);
  }
  return total;
}

/**
 * Builds the size artifact for a note page. The rendered page bytes exclude
 * inline image data URIs so embedded images are not counted twice.
 * @param title Note title used as the original name
 * @param pageHtml Rendered HTML of the note page
 * @returns A note size artifact
 */
export function createNoteArtifact(title: string, pageHtml: string): SizeArtifact {
  return {
    kind: 'note',
    original: title,
    exportType: 'HTML',
    bytes: Math.max(0, utf8ByteLength(pageHtml) - inlineDataUriBytes(pageHtml)),
  };
}

/**
 * Computes the share of each category relative to a total.
 * @param values Category byte values
 * @param total Total byte count
 * @returns A new array with a `share` fraction per entry (0 when total is 0)
 */
export function computeShares<T extends { bytes: number }>(values: T[], total: number): Array<T & { share: number }> {
  return values.map((entry) => ({
    ...entry,
    share: total > 0 ? entry.bytes / total : 0,
  }));
}

/**
 * Collects byte contributions while an export is rendered and turns them into
 * an {@link ExportSizeReport} once the export is complete.
 *
 * The ledger is deliberately framework-free: it only stores numbers and never
 * touches Obsidian, the DOM or the filesystem, so it can be unit tested in
 * isolation. Rendering code feeds it via the `record*` methods; the export
 * command finalizes it with the actual document sizes.
 */

import type { CompressionMeta } from './selfExtract';
import {
  computeShares,
  SIZE_CATEGORY_ORDER,
  type ExportSizeReport,
  type ImageFormatSize,
  type SizeArtifact,
  type SizeCategory,
  type SizeCategoryKey,
} from './exportSizeReport';

/** Number of largest artifacts reported. */
export const LARGEST_ARTIFACT_LIMIT = 5;

export interface ImageSizeRecord {
  /** Content hash; identical hashes are counted as duplicates. */
  hash?: string;
  /** Normalized image format, e.g. `webp`, `png`, `svg`. */
  format: string;
  /** Bytes of the original source file. */
  originalBytes: number;
  /** Bytes of the embedded representation (data URI). */
  embeddedBytes: number;
}

export class ExportSizeLedger {
  private noteBytes = 0;
  private noteCount = 0;
  private originalImageBytes = 0;
  private embeddedImageBytes = 0;
  private diagramBytes = 0;
  private codeBytes = 0;
  private cssBytes = 0;
  private jsBytes = 0;
  private rawBytes = 0;
  private outputBytes = 0;
  private compression?: CompressionMeta;
  private imageReferences = 0;
  private uniqueImages = 0;
  private deduplicationSavingBytes = 0;
  private readonly imageFormats = new Map<string, { bytes: number; count: number }>();
  private readonly seenImageHashes = new Set<string>();
  private readonly artifacts: SizeArtifact[] = [];

  /**
   * Records the original size of one note source file.
   * @param bytes Original file size in bytes
   */
  recordNoteSource(bytes: number): void {
    this.noteCount++;
    if (bytes > 0) {
      this.noteBytes += bytes;
    }
  }

  /**
   * Records one image reference. Identical hashes are counted once for the
   * embedded size; further references only increase the reference counter and
   * the deduplication saving.
   * @param record The image size record
   */
  recordImage(record: ImageSizeRecord): void {
    this.imageReferences++;
    const embeddedBytes = Math.max(0, record.embeddedBytes);
    const originalBytes = Math.max(0, record.originalBytes);

    if (record.hash !== undefined) {
      if (this.seenImageHashes.has(record.hash)) {
        this.deduplicationSavingBytes += embeddedBytes;
        return;
      }
      this.seenImageHashes.add(record.hash);
    }

    this.uniqueImages++;
    this.embeddedImageBytes += embeddedBytes;
    this.originalImageBytes += originalBytes;

    const entry = this.imageFormats.get(record.format) ?? { bytes: 0, count: 0 };
    entry.bytes += embeddedBytes;
    entry.count++;
    this.imageFormats.set(record.format, entry);
  }

  /** Records the bytes contributed by rendered diagram elements. */
  recordDiagrams(bytes: number): void {
    if (bytes > 0) {
      this.diagramBytes += bytes;
    }
  }

  /** Records the bytes contributed by rendered code blocks. */
  recordCodeBlocks(bytes: number): void {
    if (bytes > 0) {
      this.codeBytes += bytes;
    }
  }

  /**
   * Records the size of the static application shell.
   * @param sizes CSS and JavaScript byte counts
   */
  setShell(sizes: { cssBytes: number; jsBytes: number }): void {
    this.cssBytes = Math.max(0, sizes.cssBytes);
    this.jsBytes = Math.max(0, sizes.jsBytes);
  }

  /** Sets the byte size of the uncompressed HTML document. */
  setRawBytes(bytes: number): void {
    this.rawBytes = Math.max(0, bytes);
  }

  /** Sets the byte size of the file that was written to disk. */
  setOutputBytes(bytes: number): void {
    this.outputBytes = Math.max(0, bytes);
  }

  /** Attaches the compression metadata produced by the export wrapper. */
  setCompression(meta: CompressionMeta): void {
    this.compression = meta;
  }

  /**
   * Records one individual size contributor for the "largest artifacts" list.
   * Only used for ranking; it does not affect the category totals.
   * @param artifact The artifact to record
   */
  recordArtifact(artifact: SizeArtifact): void {
    if (artifact.bytes > 0) {
      this.artifacts.push(artifact);
    }
  }

  /**
   * Produces the immutable report. Categories are mutually exclusive: the
   * note markup category is the residual of the uncompressed HTML after all
   * measured categories are subtracted, so the breakdown always sums up.
   */
  finalize(): ExportSizeReport {
    const rawBytes = this.rawBytes;
    const measured =
      this.embeddedImageBytes + this.diagramBytes + this.codeBytes + this.cssBytes + this.jsBytes;

    const categoryBytes: Record<SizeCategoryKey, number> = {
      noteMarkup: Math.max(0, rawBytes - measured),
      images: this.embeddedImageBytes,
      diagrams: this.diagramBytes,
      codeBlocks: this.codeBytes,
      css: this.cssBytes,
      javascript: this.jsBytes,
    };

    const categories: SizeCategory[] = computeShares(
      SIZE_CATEGORY_ORDER.map((key) => ({ key, bytes: categoryBytes[key] })),
      rawBytes,
    );

    const imageFormats: ImageFormatSize[] = Array.from(this.imageFormats.entries())
      .map(([format, entry]) => ({ format, bytes: entry.bytes, count: entry.count }))
      .sort((a, b) => b.bytes - a.bytes);

    const largestArtifacts: SizeArtifact[] = [...this.artifacts]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, LARGEST_ARTIFACT_LIMIT);

    return {
      rawBytes,
      outputBytes: this.outputBytes > 0 ? this.outputBytes : rawBytes,
      categories,
      imageFormats,
      vaultNoteBytes: this.noteBytes,
      vaultImageBytes: this.originalImageBytes,
      vaultOriginalBytes: this.noteBytes + this.originalImageBytes,
      embeddedImageBytes: this.embeddedImageBytes,
      imageReferences: this.imageReferences,
      uniqueImages: this.uniqueImages,
      deduplicationSavingBytes: this.deduplicationSavingBytes,
      noteCount: this.noteCount,
      largestArtifacts,
      ...(this.compression ? { compression: this.compression } : {}),
    };
  }
}

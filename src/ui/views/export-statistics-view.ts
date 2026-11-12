import type { ExportStatisticsProps } from '../types';
import type { ModalView } from '../view';
import { ARTIFACT_KIND_LABELS, formatBytes, SIZE_CATEGORY_LABELS } from '../../utils/exportSizeReport';
import { bindAction, button } from '../view-helpers';

const pair = (parent: HTMLElement, label: string, value: string, tag = ''): void => {
  const row = parent.createDiv({ cls: 'flex justify-between text-obsidian text-obsidian-xs mb-1' });
  row.createSpan({ text: label });
  row.createSpan(tag ? { text: value, attr: { 'data-tags': tag } } : { text: value });
};

const heading = (parent: HTMLElement, label: string): void => {
  parent.createEl('h3', { cls: 'mt-0 mb-3 text-obsidian font-semibold', text: label });
};

/** Displays the same size report used by export accounting, without recomputing it. */
export function createExportStatisticsView(target: HTMLElement, { report, onClose }: ExportStatisticsProps): ModalView {
  const events = new AbortController();
  target.empty();
  const compression = report.compression;

  const container = target.createDiv({ cls: 'p-0', attr: { 'data-tags': 'es-container' } });
  container.createEl('header', {
    cls: 'mt-0 mb-5 text-obsidian font-semibold',
    text: 'Export statistics',
    attr: { 'data-tags': 'es-header' },
  });

  const headline = container.createEl('section', {
    cls: 'bg-obsidian-alt p-4 rounded-lg mb-5',
    attr: { 'data-tags': 'es-headline' },
  });
  pair(headline, 'Output file', formatBytes(report.outputBytes), 'es-output');
  pair(headline, 'Uncompressed HTML', formatBytes(report.rawBytes), 'es-raw');
  if (compression && compression.mode !== 'none') {
    pair(headline, 'gzip payload', formatBytes(compression.compressedBytes));
    pair(headline, `Encoding overhead (${compression.mode})`, formatBytes(compression.encodingOverheadBytes));
    pair(headline, 'Saved by compression', (report.rawBytes >= report.outputBytes ? '−' : '+')
      + formatBytes(Math.abs(report.rawBytes - report.outputBytes)));
  }

  const categories = container.createEl('section', { cls: 'mb-5', attr: { 'data-tags': 'es-categories' } });
  heading(categories, 'By category');
  for (const category of report.categories) {
    const block = categories.createDiv({ cls: 'mb-2', attr: { 'data-tags': 'es-category' } });
    pair(block, SIZE_CATEGORY_LABELS[category.key], `${formatBytes(category.bytes)} · ${(category.share * 100).toFixed(1)}%`);
    const bar = block.createDiv({ cls: 'overflow-hidden bg-obsidian rounded-full h-2' })
      .createDiv({ cls: 'h-full rounded-full progress-gradient progress-fill' });
    bar.setCssProps({ '--pb-value': `${Math.min(100, category.bytes / (report.rawBytes || 1) * 100).toFixed(2)}%` });
  }

  if (report.imageFormats.length) {
    const formats = container.createEl('section', { cls: 'mb-5', attr: { 'data-tags': 'es-formats' } });
    heading(formats, 'Images by format');
    for (const format of report.imageFormats) {
      pair(formats.createDiv({ attr: { 'data-tags': 'es-format' } }),
        `${format.format} (${format.count})`, formatBytes(format.bytes));
    }
  }

  if (report.largestArtifacts.length) {
    const artifacts = container.createEl('section', { cls: 'mb-5', attr: { 'data-tags': 'es-artifacts' } });
    heading(artifacts, 'Largest artifacts');
    const table = artifacts.createDiv({ cls: 'artifact-table', attr: { 'data-tags': 'es-artifact-table' } });
    for (const label of ['Type', 'Original', 'Export', 'Size']) {
      table.createDiv({ cls: 'artifact-table__header', text: label });
    }
    for (const artifact of report.largestArtifacts) {
      table.createDiv({ cls: 'artifact-table__kind', text: ARTIFACT_KIND_LABELS[artifact.kind], attr: { 'data-tags': 'es-artifact-kind' } });
      table.createDiv({
        cls: 'artifact-table__original',
        text: artifact.original,
        attr: { 'data-tags': 'es-artifact-original', title: artifact.original },
      });
      table.createDiv({ cls: 'artifact-table__export', text: artifact.exportType, attr: { 'data-tags': 'es-artifact-export' } });
      table.createDiv({ cls: 'artifact-table__size', text: formatBytes(artifact.bytes), attr: { 'data-tags': 'es-artifact-size' } });
    }
  }

  const vault = container.createEl('section', { cls: 'mb-5', attr: { 'data-tags': 'es-vault' } });
  heading(vault, 'Vault vs. export');
  pair(vault, `Notes (${report.noteCount})`, formatBytes(report.vaultNoteBytes));
  pair(vault, 'Image sources', formatBytes(report.vaultImageBytes));
  pair(vault, 'Vault original', formatBytes(report.vaultOriginalBytes));
  pair(vault, `Embedded images (${report.uniqueImages} unique / ${report.imageReferences} refs)`, formatBytes(report.embeddedImageBytes));
  if (report.deduplicationSavingBytes > 0) {
    pair(vault, 'Saved by deduplication', formatBytes(report.deduplicationSavingBytes));
  }

  const footer = container.createEl('footer', {
    cls: 'flex justify-end mt-6 pt-4 border-t border-dimmed',
    attr: { 'data-tags': 'es-footer' },
  });
  button(footer, 'Close', 'close');

  bindAction(target, 'close', onClose, events.signal);
  return { dispose: (): void => events.abort() };
}

import type { ExportStatisticsProps } from '../types';
import type { ModalView } from '../view';
import { ARTIFACT_KIND_LABELS, formatBytes, SIZE_CATEGORY_LABELS } from '../../utils/exportSizeReport';
import { bindAction, button, html, type SafeHtml } from '../view-helpers';

const pair = (label: string, value: string, tag = ''): SafeHtml =>
  html`<div class="flex justify-between text-obsidian text-obsidian-xs mb-1"><span>${label}</span><span${tag ? html` data-tags="${tag}"` : ''}>${value}</span></div>`;
const heading = (label: string): SafeHtml => html`<h3 class="mt-0 mb-3 text-obsidian font-semibold">${label}</h3>`;

/** Displays the same size report used by export accounting, without recomputing it. */
export function createExportStatisticsView(target: HTMLElement, { report, onClose }: ExportStatisticsProps): ModalView {
  const events = new AbortController();
  const compression = report.compression;
  target.innerHTML = html`<div data-tags="es-container" class="p-0">
    <header data-tags="es-header" class="mt-0 mb-5 text-obsidian font-semibold">Export statistics</header>
    <section data-tags="es-headline" class="bg-obsidian-alt p-4 rounded-lg mb-5">
      ${pair('Output file', formatBytes(report.outputBytes), 'es-output')}
      ${pair('Uncompressed HTML', formatBytes(report.rawBytes), 'es-raw')}
      ${compression && compression.mode !== 'none' ? html`${pair('gzip payload', formatBytes(compression.compressedBytes))}${pair(`Encoding overhead (${compression.mode})`, formatBytes(compression.encodingOverheadBytes))}${pair('Saved by compression', (report.rawBytes >= report.outputBytes ? '−' : '+') + formatBytes(Math.abs(report.rawBytes - report.outputBytes)))}` : ''}
    </section>
    <section data-tags="es-categories" class="mb-5">${heading('By category')}
      ${report.categories.map(category => html`<div class="mb-2" data-tags="es-category">
        ${pair(SIZE_CATEGORY_LABELS[category.key], `${formatBytes(category.bytes)} · ${(category.share * 100).toFixed(1)}%`)}
        <div class="overflow-hidden bg-obsidian rounded-full h-2"><div class="h-full rounded-full progress-gradient" style="width:${Math.min(100, category.bytes / (report.rawBytes || 1) * 100).toFixed(2)}%"></div></div>
      </div>`)}
    </section>
    ${report.imageFormats.length ? html`<section data-tags="es-formats" class="mb-5">${heading('Images by format')}
      ${report.imageFormats.map(format => html`<div data-tags="es-format">${pair(`${format.format} (${format.count})`, formatBytes(format.bytes))}</div>`)}
    </section>` : ''}
    ${report.largestArtifacts.length ? html`<section data-tags="es-artifacts" class="mb-5">${heading('Largest artifacts')}
      <div class="artifact-table" data-tags="es-artifact-table">
        ${['Type', 'Original', 'Export', 'Size'].map(label => html`<div class="artifact-table__header">${label}</div>`)}
        ${report.largestArtifacts.map(artifact => html`
          <div class="artifact-table__kind" data-tags="es-artifact-kind">${ARTIFACT_KIND_LABELS[artifact.kind]}</div>
          <div class="artifact-table__original" data-tags="es-artifact-original" title="${artifact.original}">${artifact.original}</div>
          <div class="artifact-table__export" data-tags="es-artifact-export">${artifact.exportType}</div>
          <div class="artifact-table__size" data-tags="es-artifact-size">${formatBytes(artifact.bytes)}</div>`)}
      </div>
    </section>` : ''}
    <section data-tags="es-vault" class="mb-5">${heading('Vault vs. export')}
      ${pair(`Notes (${report.noteCount})`, formatBytes(report.vaultNoteBytes))}
      ${pair('Image sources', formatBytes(report.vaultImageBytes))}
      ${pair('Vault original', formatBytes(report.vaultOriginalBytes))}
      ${pair(`Embedded images (${report.uniqueImages} unique / ${report.imageReferences} refs)`, formatBytes(report.embeddedImageBytes))}
      ${report.deduplicationSavingBytes > 0 ? pair('Saved by deduplication', formatBytes(report.deduplicationSavingBytes)) : ''}
    </section>
    <footer data-tags="es-footer" class="flex justify-end mt-6 pt-4 border-t border-dimmed">${button('Close', 'close')}</footer>
  </div>`.value;
  bindAction(target, 'close', onClose, events.signal);
  return { dispose: (): void => events.abort() };
}

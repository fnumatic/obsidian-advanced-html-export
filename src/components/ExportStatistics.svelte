<script lang="ts">
  import type { ExportStatisticsProps } from './types';
  import { ARTIFACT_KIND_LABELS, formatBytes, SIZE_CATEGORY_LABELS } from '../utils/exportSizeReport';

  let { report, onClose }: ExportStatisticsProps = $props();

  const total = $derived(report.rawBytes || 1);
  const compressionActive = $derived(report.compression !== undefined && report.compression.mode !== 'none');
  const savingBytes = $derived(report.rawBytes - report.outputBytes);

  function percent(share: number): string {
    return `${(share * 100).toFixed(1)}%`;
  }
</script>

<div data-tags="es-container" class="p-0">
  <header data-tags="es-header" class="mt-0 mb-5 text-obsidian font-semibold">
    Export statistics
  </header>

  <section data-tags="es-headline" class="bg-obsidian-alt p-4 rounded-lg mb-5">
    <div class="flex justify-between items-baseline">
      <span class="text-obsidian-muted">Output file</span>
      <span class="text-obsidian font-semibold" data-tags="es-output">{formatBytes(report.outputBytes)}</span>
    </div>
    <div class="flex justify-between items-baseline mt-1">
      <span class="text-obsidian-muted">Uncompressed HTML</span>
      <span class="text-obsidian" data-tags="es-raw">{formatBytes(report.rawBytes)}</span>
    </div>
    {#if compressionActive && report.compression}
      <div class="flex justify-between items-baseline mt-1">
        <span class="text-obsidian-muted">gzip payload</span>
        <span class="text-obsidian">{formatBytes(report.compression.compressedBytes)}</span>
      </div>
      <div class="flex justify-between items-baseline mt-1">
        <span class="text-obsidian-muted">Encoding overhead ({report.compression.mode})</span>
        <span class="text-obsidian">{formatBytes(report.compression.encodingOverheadBytes)}</span>
      </div>
      <div class="flex justify-between items-baseline mt-1">
        <span class="text-obsidian-muted">Saved by compression</span>
        <span class="text-obsidian">{savingBytes >= 0 ? '−' : '+'}{formatBytes(Math.abs(savingBytes))}</span>
      </div>
    {/if}
  </section>

  <section data-tags="es-categories" class="mb-5">
    <h3 class="mt-0 mb-3 text-obsidian font-semibold">By category</h3>
    {#each report.categories as category (category.key)}
      <div class="mb-2" data-tags="es-category">
        <div class="flex justify-between text-obsidian text-obsidian-xs mb-1">
          <span>{SIZE_CATEGORY_LABELS[category.key]}</span>
          <span>{formatBytes(category.bytes)} · {percent(category.share)}</span>
        </div>
        <div class="overflow-hidden bg-obsidian rounded-full h-2">
          <div
            class="h-full rounded-full progress-gradient"
            style="width: {Math.min(100, (category.bytes / total) * 100).toFixed(2)}%;"
          ></div>
        </div>
      </div>
    {/each}
  </section>

  {#if report.imageFormats.length > 0}
    <section data-tags="es-formats" class="mb-5">
      <h3 class="mt-0 mb-3 text-obsidian font-semibold">Images by format</h3>
      {#each report.imageFormats as format (format.format)}
        <div class="flex justify-between text-obsidian text-obsidian-xs mb-1" data-tags="es-format">
          <span>{format.format} ({format.count})</span>
          <span>{formatBytes(format.bytes)}</span>
        </div>
      {/each}
    </section>
  {/if}

  {#if report.largestArtifacts.length > 0}
    <section data-tags="es-artifacts" class="mb-5">
      <h3 class="mt-0 mb-3 text-obsidian font-semibold">Largest artifacts</h3>
      <div class="artifact-table" data-tags="es-artifact-table">
        <div class="artifact-table__header">Type</div>
        <div class="artifact-table__header">Original</div>
        <div class="artifact-table__header">Export</div>
        <div class="artifact-table__header artifact-table__size">Size</div>
        {#each report.largestArtifacts as artifact, index (index)}
          <div class="artifact-table__kind" data-tags="es-artifact-kind">{ARTIFACT_KIND_LABELS[artifact.kind]}</div>
          <div class="artifact-table__original" title={artifact.original} data-tags="es-artifact-original">{artifact.original}</div>
          <div class="artifact-table__export" data-tags="es-artifact-export">{artifact.exportType}</div>
          <div class="artifact-table__size" data-tags="es-artifact-size">{formatBytes(artifact.bytes)}</div>
        {/each}
      </div>
    </section>
  {/if}

  <section data-tags="es-vault" class="mb-5">
    <h3 class="mt-0 mb-3 text-obsidian font-semibold">Vault vs. export</h3>
    <div class="flex justify-between text-obsidian text-obsidian-xs mb-1">
      <span>Notes ({report.noteCount})</span>
      <span>{formatBytes(report.vaultNoteBytes)}</span>
    </div>
    <div class="flex justify-between text-obsidian text-obsidian-xs mb-1">
      <span>Image sources</span>
      <span>{formatBytes(report.vaultImageBytes)}</span>
    </div>
    <div class="flex justify-between text-obsidian text-obsidian-xs mb-1">
      <span>Vault original</span>
      <span class="font-semibold">{formatBytes(report.vaultOriginalBytes)}</span>
    </div>
    <div class="flex justify-between text-obsidian text-obsidian-xs mb-1">
      <span>Embedded images ({report.uniqueImages} unique / {report.imageReferences} refs)</span>
      <span class="font-semibold">{formatBytes(report.embeddedImageBytes)}</span>
    </div>
    {#if report.deduplicationSavingBytes > 0}
      <div class="flex justify-between text-obsidian text-obsidian-xs mb-1">
        <span>Saved by deduplication</span>
        <span>{formatBytes(report.deduplicationSavingBytes)}</span>
      </div>
    {/if}
  </section>

  <footer data-tags="es-footer" class="flex justify-end mt-6 pt-4 border-t border-dimmed">
    <button class="obsidian-btn mod-cta" onclick={() => onClose()}>
      Close
    </button>
  </footer>
</div>

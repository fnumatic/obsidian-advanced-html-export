<script lang="ts">
  import type { ExportPreviewProps } from './types';
  import Icon from './Icon.svelte';

  let { metrics, notes, onAction }: ExportPreviewProps = $props();

  function truncateTitle(title: string): string {
    return title.length > 60 ? title.slice(0, 60) + '...' : title;
  }
</script>

<div data-tags="ep-container" class="p-0">
  <header data-tags="ep-header" class="mt-0 mb-5 text-obsidian font-semibold">
    Export Preview
  </header>

  <section data-tags="ep-summary" class="bg-obsidian-alt p-4 rounded-lg mb-5 text-center text-obsidian">
    <Icon name="document" size="1.25em" />
    <span class="font-semibold">{metrics.totalNotes}</span>
    <span class="text-obsidian-muted mr-3 ml-1">notes</span>
    <span class="text-obsidian-muted mx-3">·</span>
    <Icon name="chart-bar" size="1.25em" />
    <span class="font-semibold">{metrics.estimatedDiagrams}</span>
    <span class="text-obsidian-muted mr-3 ml-1">diagrams</span>
    <span class="text-obsidian-muted mx-3">·</span>
    <Icon name="code-block" size="1.25em" />
    <span class="font-semibold">{metrics.totalCodeBlocks}</span>
    <span class="text-obsidian-muted ml-1">code blocks</span>
  </section>

  {#if notes.length > 0}
    <section data-tags="ep-notes" class="mt-5">
      <h3 class="mt-5 mb-3 text-obsidian font-semibold">Notes</h3>
      <div class="max-h-[300px] overflow-y-auto border border-obsidian rounded-md p-2">
        {#each notes as note, index}
          <div
            class="py-1.5 px-2 border-b border-obsidian-border text-obsidian-xs flex justify-between items-center"
            class:border-none={index === notes.length - 1}
          >
            <span class="max-w-[300px] whitespace-nowrap overflow-hidden text-ellipsis" title={note.title}>
              {truncateTitle(note.title)}
            </span>
            <span class="text-obsidian-muted text-obsidian-sm">
              <Icon name="chart-bar" size="1em" />{note.estimatedDiagrams} · <Icon name="link" size="1em" />{note.linkCount}
            </span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <footer data-tags="ep-footer" class="flex justify-end gap-3 mt-6 pt-4 border-t border-obsidian-border">
    <button class="obsidian-btn mod-cta" onclick={() => onAction('cancel')}>
      Cancel
    </button>
    <button class="obsidian-btn mod-cta" onclick={() => onAction('selectNotes')}>
      Select Notes
    </button>
    <button class="obsidian-btn-danger mod-warning" onclick={() => onAction('exportAll')}>
      Export All
    </button>
  </footer>
</div>

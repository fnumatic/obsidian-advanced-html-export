<script lang="ts">
  import type { RenderingProgressProps } from './types';
  import type { RenderEvent } from '../utils/detailedRenderer';
  import DetailRow from './DetailRow.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import Icon from './Icon.svelte';
  import { truncateTitle } from '../utils/renderProgress';
  import { RenderingProgressStore } from './renderingProgress.svelte';

  let {
    metrics,
    token,
    pauseController,
    onComplete,
    onCancel
  }: RenderingProgressProps = $props();

  const store = new RenderingProgressStore({
    get metrics() { return metrics; },
    get token() { return token; },
    get pauseController() { return pauseController; },
    get onComplete() { return onComplete; },
    get onCancel() { return onCancel; },
  });

  $effect(() => {
    store.start();
    return () => store.dispose();
  });

  export function handleEvent(event: RenderEvent): void {
    store.handleEvent(event);
  }
</script>

<div data-tags="rp-container" class="p-0">
  <header data-tags="rp-header" class="mt-0 mb-4 text-obsidian font-semibold">
    Rendering wiki export
  </header>

<details data-tags="rp-completed" open={store.completedOpen} class="mb-3">
    <summary class="font-semibold text-obsidian cursor-pointer py-2">
      Completed notes ({store.completedNotes.length})
    </summary>
    <div class="min-h-[114px] max-h-[114px] overflow-y-auto border border-obsidian rounded p-1.5 mt-2">
      {#each store.completedNotes as note}
        <div class="note-list-item">
          <span class="text-obsidian-muted shrink-0">✓</span>
          <span class="flex-1 ml-2 mr-4 max-w-[calc(100%-160px)] whitespace-nowrap overflow-hidden text-ellipsis text-left">
            {truncateTitle(note.title, 60)}
          </span>
          <span class="text-obsidian-muted shrink-0 whitespace-nowrap">
            <div class="note-list-stats">
              <span class="note-list-stat">
                <span class="note-list-stat-number">{(note.duration / 1000).toFixed(1)}</span>
                <Icon name="lightning"/>
              </span>
              <span class="note-list-stat">
                <span class="note-list-stat-number">{note.totalDiagrams}</span>
                <Icon name="chart-bar"/>
              </span>
              <span class="note-list-stat">
                <span class="note-list-stat-number">{note.totalCodeBlocks}</span>
                <Icon name="code-block"/>
              </span>
              <span class="note-list-stat">
                <span class="note-list-stat-number">{note.totalImages}</span>
                <Icon name="image"/>
              </span>
              <span class="note-list-stat">
                <span class="note-list-stat-number">{note.linkCount}</span>
                <Icon name="document"/>
              </span>
            </div>
          </span>
        </div>
      {/each}
    </div>
  </details>

  <section data-tags="rp-current" class="mt-3 p-2.5 bg-obsidian-alt rounded">
    <div class="font-semibold text-obsidian mb-2 whitespace-nowrap overflow-hidden text-ellipsis">
      {#if store.isCompleted}
        ✅ Rendering complete!
      {:else if store.currentNote}
        Rendering {store.currentNote.index + 1}/{metrics.totalNotes}: {truncateTitle(store.currentNote.title, 40)}
      {:else}
        Preparing...
      {/if}
    </div>

    <ProgressBar progress={store.overallProgress} />

    <div class="flex flex-col gap-1.5 mt-2">
      <DetailRow
        icon="chart-bar"
        label="Diagrams"
        processed={store.currentNote?.diagrams.processed ?? 0}
        total={store.currentNote?.diagrams.total ?? 0}
        isPlaceholder={!store.currentNote}
      />
      <DetailRow
        icon="code-block"
        label="Code blocks"
        processed={store.currentNote?.codeBlocks.processed ?? 0}
        total={store.currentNote?.codeBlocks.total ?? 0}
        isPlaceholder={!store.currentNote}
      />
      <DetailRow
        icon="image"
        label="images"
        processed={store.currentNote?.images.processed ?? 0}
        total={store.currentNote?.images.total ?? 0}
        currentPhase={store.currentNote?.images.currentPhase}
        currentFileName={store.currentNote?.images.currentFileName}
        isPlaceholder={!store.currentNote}
      />
    </div>

    <div class="mt-2 p-1.5 rounded text-obsidian-sm warning-bg h-[28px]" class:invisible={!store.warning}>
      {store.warning || ' '}
    </div>
  </section>

  <div data-tags="rp-time-stats" class="mt-2.5 p-2 bg-obsidian-alt rounded flex justify-around text-obsidian-sm">
    <div class="flex flex-col items-center gap-1">
      <span class="font-semibold">{store.elapsedLabel}</span>
      <span class="text-obsidian-xs text-obsidian-muted"><Icon name="timer" size="1em" /> Elapsed</span>
    </div>
    <div class="flex flex-col items-center gap-1">
      <span class="font-semibold">{store.remainingLabel}</span>
      <span class="text-obsidian-xs text-obsidian-muted"><Icon name="hourglass" size="1em" /> Remaining</span>
    </div>
    <div class="flex flex-col items-center gap-1">
      <span class="font-semibold">{store.speed}</span>
      <span class="text-obsidian-xs text-obsidian-muted"><Icon name="lightning" size="1em" /> Speed</span>
    </div>
  </div>

  <footer data-tags="rp-footer" class="mt-4 flex justify-between items-center gap-3">
    <div
      class="font-semibold text-obsidian-sm"
      class:visible={store.isPaused}
      class:invisible={!store.isPaused}
    >
      <Icon name="pause" size="1em" /> PAUSED
    </div>
    <div class="flex gap-3 ml-auto">
      <button
        class="obsidian-btn"
        onclick={() => store.togglePause()}
        disabled={store.isCompleted || store.isCancelled}
      >
        {#if store.isPaused}
          <Icon name="play" size="1em" /> Resume
        {:else}
          <Icon name="pause" size="1em" /> Pause
        {/if}
      </button>
      <button
        class="obsidian-btn-danger"
        onclick={() => store.cancel()}
        disabled={store.isCompleted}
      >
        Cancel export
      </button>
    </div>
  </footer>
</div>

<style>
  .visible {
    visibility: visible;
  }

  .invisible {
    visibility: hidden;
  }
</style>

<script lang="ts">
  import type { RenderingProgressProps, CompletedNote, CurrentNoteProgress } from './types';
  import type { RenderEvent } from '../utils/detailedRenderer';
  import DetailRow from './DetailRow.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import Icon from './Icon.svelte';

  let {
    metrics,
    token,
    pauseController,
    onComplete,
    onCancel
  }: RenderingProgressProps = $props();

  let completedNotes = $state<CompletedNote[]>([]);
  let currentNote = $state<CurrentNoteProgress | null>(null);
  let isPaused = $state(false);
  let isCancelled = $state(false);
  let isCompleted = $state(false);
  let startTime = $state(Date.now());
  let totalNotesRendered = $state(0);
  let warning = $state<string | null>(null);
  let completedOpen = $state(true);

  let overallProgress = $derived(() => {
    if (!currentNote) return Math.round((completedNotes.length / metrics.totalNotes) * 100);

    const notesProgress = completedNotes.length / metrics.totalNotes;
    const currentNoteProgress = calculateCurrentNoteProgress();
    const totalProgress = (notesProgress * 100) + (currentNoteProgress * (100 / metrics.totalNotes));
    return Math.min(100, Math.round(totalProgress));
  });

  let elapsedTime = $state(0);
  let remainingTime = $state<number | null>(null);
  let speed = $state<string>('Starting...');

  $effect(() => {
    const interval = setInterval(() => {
      if (isCancelled || isCompleted) return;

      elapsedTime = Date.now() - startTime;

      if (totalNotesRendered > 0) {
        const avgTimePerNote = elapsedTime / totalNotesRendered;
        const remainingNotes = metrics.totalNotes - totalNotesRendered;
        remainingTime = avgTimePerNote * remainingNotes;
        speed = `${(totalNotesRendered / (elapsedTime / 60000)).toFixed(1)} notes/min`;
      }
    }, 1000);

    return () => clearInterval(interval);
  });

  $effect(() => {
    if (warning) {
      const timeout = setTimeout(() => {
        warning = null;
      }, 5000);
      return () => clearTimeout(timeout);
    }
  });

  function calculateCurrentNoteProgress(): number {
    if (!currentNote) return 0;

    const diagramWeight = 0.3;
    const codeblockWeight = 0.2;
    const imageWeight = 0.5;

    const diagramProgress = currentNote.diagrams.total > 0
      ? currentNote.diagrams.processed / currentNote.diagrams.total
      : 0;

    const codeblockProgress = currentNote.codeBlocks.total > 0
      ? currentNote.codeBlocks.processed / currentNote.codeBlocks.total
      : 0;

    const imageProgress = currentNote.images.total > 0
      ? currentNote.images.processed / currentNote.images.total
      : 0;

    return (diagramProgress * diagramWeight) +
           (codeblockProgress * codeblockWeight) +
           (imageProgress * imageWeight);
  }

  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }

  function truncateTitle(title: string, maxLength: number): string {
    return title.length > maxLength ? title.slice(0, maxLength) + '...' : title;
  }

  function handlePauseToggle() {
    if (isPaused) {
      pauseController.resume();
      isPaused = false;
    } else {
      pauseController.pause();
      isPaused = true;
    }
  }

  function handleCancel() {
    isCancelled = true;
    token.cancel();
    warning = 'Cancelling... Please wait for current operation to complete.';

    setTimeout(() => {
      onCancel();
    }, 500);
  }

  export function handleEvent(event: RenderEvent): void {
    if (isCancelled) return;

    switch (event.type) {
      case 'note_start':
        handleNoteStart(event);
        break;
      case 'note_complete':
        handleNoteComplete(event);
        break;
      case 'note_error':
        handleNoteError(event);
        break;
      case 'diagram_start':
        handleDiagramStart(event);
        break;
      case 'diagram_complete':
        handleDiagramComplete();
        break;
      case 'codeblock_start':
        handleCodeBlockStart(event);
        break;
      case 'codeblock_complete':
        handleCodeBlockComplete();
        break;
      case 'image_start':
        handleImageStart(event);
        break;
      case 'image_phase':
        handleImagePhase(event);
        break;
      case 'image_complete':
        handleImageComplete();
        break;
      case 'warning_slow_operation':
        handleWarning(event);
        break;
    }
  }

  function handleNoteStart(event: RenderEvent) {
    console.log('[DEBUG] note_start event:', event);
    const index = completedNotes.length;
    currentNote = {
      title: event.noteTitle || 'Unknown',
      path: event.notePath || '',
      index: index,
      total: metrics.totalNotes,
      diagrams: { total: (event.details?.totalDiagrams as number) || 0, processed: 0 },
      codeBlocks: { total: (event.details?.totalCodeBlocks as number) || 0, processed: 0 },
      images: { total: (event.details?.totalImages as number) || 0, processed: 0 },
      overallProgress: 0
    };
    console.log('[DEBUG] currentNote set to:', currentNote);
  }

  function handleNoteComplete(event: RenderEvent) {
    if (!currentNote) return;

    const completed: CompletedNote = {
      title: currentNote.title,
      path: currentNote.path,
      duration: (event.details?.duration as number) || 0,
      totalDiagrams: (event.details?.totalDiagrams as number) || 0,
      totalCodeBlocks: (event.details?.totalCodeBlocks as number) || 0,
      totalImages: (event.details?.totalImages as number) || 0
    };

    completedNotes = [...completedNotes, completed];
    totalNotesRendered++;
    currentNote = null;

    if (completedNotes.length === metrics.totalNotes && !isCancelled) {
      isCompleted = true;
      setTimeout(() => {
        onComplete();
      }, 1000);
    }
  }

  function handleNoteError(event: RenderEvent) {
    warning = `Error rendering ${event.noteTitle}: ${event.details?.error}`;
  }

  // Helper function for immutable progress updates
  function updateProgress(
    type: 'diagrams' | 'codeBlocks' | 'images',
    updates: Partial<{ total: number; processed: number; currentFileName?: string; currentPhase?: string }>
  ) {
    if (!currentNote) {
      console.log('[DEBUG] updateProgress called but currentNote is null');
      return;
    }
    console.log(`[DEBUG] updateProgress for ${type}:`, updates, 'current:', currentNote[type]);
    currentNote = {
      ...currentNote,
      [type]: {
        ...currentNote[type],
        ...updates
      }
    };
    console.log(`[DEBUG] ${type} after update:`, currentNote[type]);
  }

  function handleImageStart(event: RenderEvent) {
    console.log('[DEBUG] image_start event:', event);
    updateProgress('images', {
      total: (event.details?.total as number) || 0,
      currentFileName: (event.details?.fileName as string) || ''
    });
  }

  function handleImagePhase(event: RenderEvent) {
    console.log('[DEBUG] image_phase event:', event);
    updateProgress('images', {
      currentPhase: (event.details?.phase as string) || ''
    });
  }

  function handleImageComplete() {
    console.log('[DEBUG] image_complete event');
    if (!currentNote) return;
    updateProgress('images', {
      processed: currentNote.images.processed + 1
    });
  }

  function handleDiagramStart(event: RenderEvent) {
    console.log('[DEBUG] diagram_start event:', event);
    updateProgress('diagrams', {
      total: (event.details?.totalDiagrams as number) || 0
    });
  }

  function handleDiagramComplete() {
    console.log('[DEBUG] diagram_complete event');
    if (!currentNote) return;
    updateProgress('diagrams', {
      processed: currentNote.diagrams.processed + 1
    });
  }

  function handleCodeBlockStart(event: RenderEvent) {
    console.log('[DEBUG] codeblock_start event:', event);
    updateProgress('codeBlocks', {
      total: (event.details?.totalCodeBlocks as number) || 0
    });
  }

  function handleCodeBlockComplete() {
    console.log('[DEBUG] codeblock_complete event');
    if (!currentNote) return;
    updateProgress('codeBlocks', {
      processed: currentNote.codeBlocks.processed + 1
    });
  }

  function handleWarning(event: RenderEvent) {
    const details = event.details;
    if (details?.operation === 'image_processing') {
      const duration = typeof details.duration === 'number' ? details.duration : 0;
      warning = `⚠️ Slow operation: ${details.fileName} (${(duration / 1000).toFixed(1)}s)`;
    } else if (details?.operation === 'markdown_render') {
      const duration = typeof details.duration === 'number' ? details.duration : 0;
      warning = `⚠️ Note is taking long to render: ${details.noteName} (${(duration / 1000).toFixed(1)}s)`;
    }
  }
</script>

<div data-tags="rp-container" class="p-0">
  <header data-tags="rp-header" class="mt-0 mb-4 text-obsidian font-semibold">
    Rendering Wiki Export
  </header>

<details data-tags="rp-completed" open={completedOpen} class="mb-3">
    <summary class="font-semibold text-obsidian cursor-pointer py-2">
      Completed Notes ({completedNotes.length})
    </summary>
    <div class="min-h-[114px] max-h-[114px] overflow-y-auto border border-obsidian rounded p-1.5 mt-2">
      {#each completedNotes as note}
        <div class="note-list-item">
          <span class="text-obsidian-muted shrink-0">✓</span>
          <span class="flex-1 ml-2 mr-4 max-w-[calc(100%-160px)] whitespace-nowrap overflow-hidden text-ellipsis text-left">
            {truncateTitle(note.title, 60)}
          </span>
          <span class="text-obsidian-muted shrink-0 whitespace-nowrap">
            {(note.duration / 1000).toFixed(1)}s · <Icon name="chart-bar" size="1em" />{note.totalDiagrams} · <Icon name="document" size="1em" />{note.totalCodeBlocks} · <Icon name="image" size="1em" />{note.totalImages}
          </span>
        </div>
      {/each}
    </div>
  </details>

  <section data-tags="rp-current" class="mt-3 p-2.5 bg-obsidian-alt rounded">
    <div class="font-semibold text-obsidian mb-2 whitespace-nowrap overflow-hidden text-ellipsis">
      {#if isCompleted}
        ✅ Rendering complete!
      {:else if currentNote}
        Rendering {currentNote.index + 1}/{metrics.totalNotes}: {truncateTitle(currentNote.title, 40)}
      {:else}
        Preparing...
      {/if}
    </div>

    <ProgressBar progress={overallProgress()} />

    <div class="flex flex-col gap-1.5 mt-2">
      <DetailRow
        icon="chart-bar"
        label="Diagrams"
        processed={currentNote?.diagrams.processed ?? 0}
        total={currentNote?.diagrams.total ?? 0}
        isPlaceholder={!currentNote}
      />
      <DetailRow
        icon="code-block"
        label="Code blocks"
        processed={currentNote?.codeBlocks.processed ?? 0}
        total={currentNote?.codeBlocks.total ?? 0}
        isPlaceholder={!currentNote}
      />
      <DetailRow
        icon="image"
        label="Images"
        processed={currentNote?.images.processed ?? 0}
        total={currentNote?.images.total ?? 0}
        currentPhase={currentNote?.images.currentPhase}
        currentFileName={currentNote?.images.currentFileName}
        isPlaceholder={!currentNote}
      />
    </div>

    {#if warning}
      <div class="mt-2 p-1.5 rounded text-obsidian-sm warning-bg">
        {warning}
      </div>
    {/if}
  </section>

  <div data-tags="rp-time-stats" class="mt-2.5 p-2 bg-obsidian-alt rounded flex justify-around text-obsidian-sm">
    <div class="flex flex-col items-center gap-1">
      <span class="font-semibold">{formatDuration(elapsedTime)}</span>
      <span class="text-obsidian-xs text-obsidian-muted"><Icon name="timer" size="1em" /> Elapsed</span>
    </div>
    <div class="flex flex-col items-center gap-1">
      <span class="font-semibold">{remainingTime ? `~${formatDuration(remainingTime)}` : 'Calculating...'}</span>
      <span class="text-obsidian-xs text-obsidian-muted"><Icon name="hourglass" size="1em" /> Remaining</span>
    </div>
    <div class="flex flex-col items-center gap-1">
      <span class="font-semibold">{speed}</span>
      <span class="text-obsidian-xs text-obsidian-muted"><Icon name="lightning" size="1em" /> Speed</span>
    </div>
  </div>

  <footer data-tags="rp-footer" class="mt-4 flex justify-between items-center gap-3">
    <div
      class="font-semibold text-obsidian-sm"
      class:visible={isPaused}
      class:invisible={!isPaused}
    >
      <Icon name="pause" size="1em" /> PAUSED
    </div>
    <div class="flex gap-3 ml-auto">
      <button
        class="obsidian-btn"
        onclick={handlePauseToggle}
        disabled={isCompleted || isCancelled}
      >
        {#if isPaused}
          <Icon name="play" size="1em" /> Resume
        {:else}
          <Icon name="pause" size="1em" /> Pause
        {/if}
      </button>
      <button
        class="obsidian-btn-danger"
        onclick={handleCancel}
        disabled={isCompleted}
      >
        Cancel Export
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

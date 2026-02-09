<script lang="ts">
  import type { RenderingProgressProps, CompletedNote, CurrentNoteProgress } from './types';
  import type { RenderEvent } from '../utils/detailedRenderer';
  import DetailRow from './DetailRow.svelte';
  
  let { 
    metrics, 
    token, 
    pauseController, 
    onComplete, 
    onCancel
  }: RenderingProgressProps = $props();
  
  // State
  let completedNotes = $state<CompletedNote[]>([]);
  let currentNote = $state<CurrentNoteProgress | null>(null);
  let isPaused = $state(false);
  let isCancelled = $state(false);
  let isCompleted = $state(false);
  let startTime = $state(Date.now());
  let totalNotesRendered = $state(0);
  let warning = $state<string | null>(null);
  let completedOpen = $state(true);
  
  // Derived state
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
  
  // Update time stats every second
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
  
  // Auto-hide warning after 5 seconds
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
  
  // Public method to handle render events - called via component reference
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
    
    // Check if all notes are completed
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
  
  function handleImageStart(event: RenderEvent) {
    if (!currentNote) return;
    currentNote.images.total = (event.details?.total as number) || 0;
    currentNote.images.currentFileName = (event.details?.fileName as string) || '';
  }
  
  function handleImagePhase(event: RenderEvent) {
    if (!currentNote) return;
    currentNote.images.currentPhase = (event.details?.phase as string) || '';
  }
  
  function handleImageComplete() {
    if (!currentNote) return;
    currentNote.images.processed++;
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

<div class="rendering-progress">
  <h2>Rendering Wiki Export</h2>
  
  <!-- Completed Notes Section -->
  <details bind:open={completedOpen} class="completed-section">
    <summary>
      Completed Notes ({completedNotes.length})
    </summary>
    <div class="completed-list">
      {#each completedNotes as note}
        <div class="completed-note-item">
          <div class="completed-note-left">
            <span class="checkmark">✓</span>
            <span class="completed-note-title" title={note.title}>
              {truncateTitle(note.title, 60)}
            </span>
          </div>
          <div class="completed-note-right">
            {(note.duration / 1000).toFixed(1)}s · {note.totalDiagrams}📊 {note.totalCodeBlocks}📝 {note.totalImages}🖼️
          </div>
        </div>
      {/each}
    </div>
  </details>
  
  <!-- Current Note Section -->
  <div class="current-section">
    <!-- Overall Progress -->
    <div class="overall-progress">
      <div class="current-note-title">
        {#if isCompleted}
          ✅ Rendering complete!
        {:else if currentNote}
          Rendering {currentNote.index + 1}/{metrics.totalNotes}: {truncateTitle(currentNote.title, 40)}
        {:else}
          Preparing...
        {/if}
      </div>
      
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: {overallProgress()}%">
          <span class="progress-text">{overallProgress()}%</span>
        </div>
      </div>
    </div>
    
      <!-- Detailed Progress -->
      <div class="detailed-progress">
        <DetailRow 
          icon="📊" 
          label="Diagrams" 
          progress={currentNote?.diagrams}
          isPlaceholder={!currentNote}
        />
        <DetailRow 
          icon="📝" 
          label="Code blocks" 
          progress={currentNote?.codeBlocks}
          isPlaceholder={!currentNote}
        />
        <DetailRow 
          icon="🖼️" 
          label="Images" 
          progress={currentNote?.images}
          currentPhase={currentNote?.images.currentPhase}
          currentFileName={currentNote?.images.currentFileName}
          isPlaceholder={!currentNote}
        />
      </div>
    
    <!-- Warning area -->
    {#if warning}
      <div class="warning-area">
        {warning}
      </div>
    {/if}
  </div>
  
  <!-- Time stats -->
  <div class="time-stats">
    <div class="time-stat">
      <div class="time-value">{formatDuration(elapsedTime)}</div>
      <div class="time-label">⏱️ Elapsed</div>
    </div>
    <div class="time-stat">
      <div class="time-value">{remainingTime ? `~${formatDuration(remainingTime)}` : 'Calculating...'}</div>
      <div class="time-label">⏳ Remaining</div>
    </div>
    <div class="time-stat">
      <div class="time-value">{speed}</div>
      <div class="time-label">⚡ Speed</div>
    </div>
  </div>
  
  <!-- Bottom row: Status + Buttons -->
  <div class="bottom-container">
    <div class="pause-status" class:visible={isPaused}>
      ⏸️ PAUSED
    </div>
    <div class="button-container">
      <button onclick={handlePauseToggle} disabled={isCompleted || isCancelled}>
        {isPaused ? '▶️ Resume' : '⏸️ Pause'}
      </button>
      <button class="mod-warning" onclick={handleCancel} disabled={isCompleted}>
        Cancel Export
      </button>
    </div>
  </div>
</div>

<style>
  .rendering-progress {
    padding: 0;
  }
  
  h2 {
    margin-top: 0;
    margin-bottom: 16px;
  }
  
  .completed-section {
    margin-bottom: 12px;
  }
  
  .completed-section summary {
    font-weight: 600;
    font-size: 1.1em;
    cursor: pointer;
    padding: 8px 0;
  }
  
  .completed-list {
    min-height: 114px;
    max-height: 114px;
    overflow-y: auto;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 6px;
    margin-top: 8px;
  }
  
  .completed-note-item {
    padding: 2px 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8em;
  }
  
  .completed-note-left {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
  }
  
  .checkmark {
    color: var(--text-success);
  }
  
  .completed-note-title {
    max-width: 360px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .completed-note-right {
    color: var(--text-muted);
    font-size: 0.85em;
    white-space: nowrap;
  }
  
  .current-section {
    margin-top: 12px;
    padding: 10px;
    background: var(--background-secondary);
    border-radius: 6px;
  }
  
  .current-note-title {
    font-weight: 600;
    font-size: 1.1em;
    margin-bottom: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .progress-bar-container {
    width: 100%;
    height: 18px;
    background: var(--background-modifier-border);
    border-radius: 9px;
    overflow: hidden;
    position: relative;
    align-items: start;
  }
  
  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--interactive-accent) 0%, var(--interactive-accent-hover) 100%);
    transition: width 0.3s ease;
    border-top-left-radius: 9px;
    border-bottom-left-radius: 9px;
    position: relative;
    align-items: start;
  }
  
  .progress-text {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    color: white;
    font-size: 0.85em;
    font-weight: 600;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    white-space: nowrap;
  }
  
  .detailed-progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }
  
  .warning-area {
    margin-top: 8px;
    padding: 6px 8px;
    background: var(--background-modifier-error);
    color: var(--text-error);
    border-radius: 4px;
    font-size: 0.85em;
  }
  
  .time-stats {
    margin-top: 10px;
    padding: 8px;
    background: var(--background-modifier-form-field);
    border-radius: 4px;
    display: flex;
    justify-content: space-around;
    font-size: 0.85em;
  }
  
  .time-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  
  .time-value {
    font-weight: 600;
  }
  
  .time-label {
    color: var(--text-muted);
    font-size: 0.85em;
  }
  
  .bottom-container {
    margin-top: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  
  .pause-status {
    font-weight: 600;
    color: var(--text-warning);
    font-size: 0.95em;
    visibility: hidden;
  }
  
  .pause-status.visible {
    visibility: visible;
  }
  
  .button-container {
    display: flex;
    gap: 12px;
    margin-left: auto;
  }
  
  button {
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.15s;
  }
  
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  button:not(.mod-warning) {
    background-color: var(--background-modifier-form-field);
    color: var(--text-normal);
  }
  
  button:not(.mod-warning):hover:not(:disabled) {
    background-color: var(--background-modifier-hover);
  }
  
  button.mod-warning {
    background-color: var(--background-modifier-error);
    color: var(--text-error);
  }
  
  button.mod-warning:hover:not(:disabled) {
    background-color: var(--interactive-normal);
  }
</style>

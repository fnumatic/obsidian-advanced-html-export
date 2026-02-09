<script lang="ts">
  interface Progress {
    total: number;
    processed: number;
    currentPhase?: string;
    currentFileName?: string;
  }

  let { 
    icon, 
    label, 
    progress, 
    currentPhase, 
    currentFileName,
    isPlaceholder = false
  }: { 
    icon: string; 
    label: string; 
    progress: Progress | null | undefined;
    currentPhase?: string;
    currentFileName?: string;
    isPlaceholder?: boolean;
  } = $props();

  let isEmpty = $derived(!progress || progress.total === 0);
</script>

<div class="detail-row">
  <div class="detail-line1">
    <span class="detail-icon">{icon}</span>
    <span class="detail-label">{label}</span>
    <div class="detail-progress-container" class:placeholder={isPlaceholder}>
      <div class="detail-progress-bar" 
           style="width: {isEmpty ? 0 : (progress!.processed / progress!.total) * 100}%">
      </div>
    </div>
    <span class="detail-count">
      {isPlaceholder ? '-/-' : `${progress!.processed}/${progress!.total}`}
    </span>
  </div>
  <div class="detail-status">
    {#if isPlaceholder}
      Waiting...
    {:else if isEmpty}
      None
    {:else if currentPhase}
      {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)}: {currentFileName}
    {:else}
      Processing...
    {/if}
  </div>
</div>

<style>
  .detail-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.85em;
  }
  
  .detail-line1 {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .detail-icon {
    font-size: 1em;
  }
  
  .detail-label {
    white-space: nowrap;
  }
  
  .detail-progress-container {
    flex: 1;
    height: 6px;
    background: var(--background-modifier-border);
    border-radius: 3px;
    overflow: hidden;
    min-width: 60px;
  }
  
  .detail-progress-container.placeholder {
    background: var(--background-modifier-border);
    opacity: 0.5;
  }
  
  .detail-progress-bar {
    height: 100%;
    background: var(--interactive-accent);
    transition: width 0.2s ease;
  }
  
  .detail-progress-container.placeholder .detail-progress-bar {
    background: var(--text-muted);
  }
  
  .detail-count {
    color: var(--text-muted);
    white-space: nowrap;
  }
  
  .detail-status {
    font-size: 0.8em;
    color: var(--text-muted);
    height: 14px;
    padding-left: 22px;
  }
</style>

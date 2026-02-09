<script lang="ts">
  import ProgressBar from './ProgressBar.svelte';
  
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
  
  let percent = $derived(progress && progress.total > 0 
    ? (progress.processed / progress.total) * 100 
    : 0);
    
  let status = $derived.by(() => {
    if (isPlaceholder) return 'Waiting...';
    if (!progress || progress.total === 0) return 'None';
    if (currentPhase) {
      const phaseNames: Record<string, string> = {
        'reading': `Reading: ${currentFileName}`,
        'hashing': `Hashing: ${currentFileName}`,
        'optimizing': `Optimizing: ${currentFileName}`
      };
      return phaseNames[currentPhase] || `${currentPhase.charAt(0).toUpperCase()}${currentPhase.slice(1)}: ${currentFileName}`;
    }
    return 'Processing...';
  });
</script>

<div class="detail-row">
  <div class="detail-main">
    <span class="icon">{icon}</span>
    <span class="label">{label}</span>
    <ProgressBar progress={percent} size="small" />
    <span class="count">{isPlaceholder ? '-/-' : `${progress?.processed ?? 0}/${progress?.total ?? 0}`}</span>
  </div>
  <div class="detail-status">{status}</div>
</div>

<style>
  .detail-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.875rem;
  }
  
  .detail-main {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .icon {
    font-size: 1rem;
    width: 20px;
    text-align: center;
  }
  
  .label {
    white-space: nowrap;
    color: var(--text-muted);
  }
  
  .count {
    white-space: nowrap;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 50px;
    text-align: right;
  }
  
  .detail-status {
    font-size: 0.75rem;
    color: var(--text-muted);
    padding-left: 28px;
    min-height: 16px;
  }
</style>

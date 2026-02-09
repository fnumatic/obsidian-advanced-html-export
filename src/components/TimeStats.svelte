<script lang="ts">
  let { elapsed, remaining, speed } = $props();
  
  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }
</script>

<div class="time-stats">
  <div class="stat">
    <span class="value">{formatDuration(elapsed)}</span>
    <span class="label">⏱️ Elapsed</span>
  </div>
  <div class="stat">
    <span class="value">{remaining ? `~${formatDuration(remaining)}` : 'Calculating...'}</span>
    <span class="label">⏳ Remaining</span>
  </div>
  <div class="stat">
    <span class="value">{speed}</span>
    <span class="label">⚡ Speed</span>
  </div>
</div>

<style>
  .time-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    padding: 12px;
    background: var(--background-modifier-form-field);
    border-radius: 8px;
    margin-top: 12px;
  }
  
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  
  .value {
    font-weight: 600;
    font-size: 0.9375rem;
  }
  
  .label {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>

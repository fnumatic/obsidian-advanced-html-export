<script lang="ts">
  let { progress, size = 'normal' }: { progress: number, size?: 'normal' | 'small' } = $props();
</script>

<div class="progress-container" data-size={size}>
  <div class="progress-fill" style="width: {progress}%"></div>
  {#if size === 'normal'}
    <span class="progress-text">{Math.round(progress)}%</span>
  {/if}
</div>

<style>
  .progress-container {
    background: var(--background-modifier-border);
    border-radius: 999px;
    overflow: hidden;
    position: relative;
  }
  
  .progress-container[data-size="normal"] {
    height: 20px;
  }
  
  .progress-container[data-size="small"] {
    height: 6px;
    flex: 1;
    min-width: 60px;
  }
  
  .progress-fill {
    height: 100%;
    background: var(--interactive-accent);
    transition: width 0.3s ease;
    border-radius: 999px;
  }
  
  .progress-text {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
</style>

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

<div data-tags="ts-container" class="grid grid-cols-3 gap-4 p-3 bg-obsidian-alt rounded-lg mt-3 text-obsidian-sm">
  <div data-tags="ts-stat" class="flex flex-col items-center gap-1">
    <span class="font-semibold text-obsidian">{formatDuration(elapsed)}</span>
    <span class="text-obsidian-xs text-obsidian-muted">⏱️ Elapsed</span>
  </div>
  <div data-tags="ts-stat" class="flex flex-col items-center gap-1">
    <span class="font-semibold text-obsidian">{remaining ? `~${formatDuration(remaining)}` : 'Calculating...'}</span>
    <span class="text-obsidian-xs text-obsidian-muted">⏳ Remaining</span>
  </div>
  <div data-tags="ts-stat" class="flex flex-col items-center gap-1">
    <span class="font-semibold text-obsidian">{speed}</span>
    <span class="text-obsidian-xs text-obsidian-muted">⚡ Speed</span>
  </div>
</div>

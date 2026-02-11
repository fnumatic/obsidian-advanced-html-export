<script lang="ts">
  let { progress, size = 'normal' }: { progress: number; size?: 'normal' | 'small' } = $props();
</script>

<div
  data-tags="pb-container"
  class="relative overflow-hidden rounded-full bg-obsidian"
  class:h-5={size === 'normal'}
  class:h-1.5={size === 'small'}
  class:flex={size === 'small'}
  class:flex-1={size === 'small'}
  class:min-w-15={size === 'small'}
>
  <div
    data-tags="pb-fill"
    class="h-full rounded-full transition-all duration-300"
    style="width: {progress}%; background: var(--interactive-accent);"
  ></div>
  {#if size === 'normal'}
    <span data-tags="pb-text" class="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white" style="text-shadow: 0 1px 2px rgba(0,0,0,0.3);">
      {Math.round(progress)}%
    </span>
  {/if}
</div>

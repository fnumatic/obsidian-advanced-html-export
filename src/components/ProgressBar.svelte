<script lang="ts">
  interface ProgressBarProps {
    progress: number;
    size?: 'normal' | 'small' | 'inline';
    showText?: boolean;
  }

  let { progress, size = 'normal', showText = true }: ProgressBarProps = $props();
</script>

<div
  data-tags="pb-container"
  class="overflow-hidden bg-obsidian"
  class:rounded-full={size === 'normal' || size === 'inline'}
  class:rounded={size === 'small'}
  class:h-4={size === 'normal'}
  class:h-1.5={size === 'small'}
  class:h-2={size === 'inline'}
  class:relative={size === 'normal'}
>
  <div
    data-tags="pb-fill"
    class="h-full rounded-full transition-all duration-300 progress-gradient"
    class:rounded-l={size === 'normal' || size === 'inline'}
    style="width: {Math.min(Math.max(progress, 0), 100)}%;"
  ></div>
  {#if size === 'normal' && showText}
    <span
      data-tags="pb-text"
      class="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white"
      style="text-shadow: 0 1px 2px rgba(0,0,0,0.3);"
    >
      {Math.round(progress)}%
    </span>
  {/if}
</div>

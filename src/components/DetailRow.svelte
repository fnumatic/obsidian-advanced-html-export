<script lang="ts">
  import ProgressBar from './ProgressBar.svelte';
  import Icon from './Icon.svelte';

  type IconName = 'chart-bar' | 'document' | 'image' | 'file' | 'settings' | 'renew' | 'link';

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
    icon: IconName;
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

<div data-tags="dr-container" class="flex flex-col gap-0.5 text-sm">
  <div data-tags="dr-main" class="flex items-center gap-2">
    <span data-tags="dr-icon" class="text-base w-5 text-center"><Icon name={icon} /></span>
    <span data-tags="dr-label" class="whitespace-nowrap text-obsidian-muted">{label}</span>
    <div class="flex-1">
      <ProgressBar progress={percent} size="small" />
    </div>
    <span data-tags="dr-progress" class="whitespace-nowrap text-obsidian-muted tabular-nums min-w-[50px] text-right">
      {isPlaceholder ? '-/-' : `${progress?.processed ?? 0}/${progress?.total ?? 0}`}
    </span>
  </div>
  <div data-tags="dr-status" class="text-xs text-obsidian-muted pl-7 min-h-4">
    {status}
  </div>
</div>

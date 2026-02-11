<script lang="ts">
  interface Props {
    title?: string;
    onClose: () => void;
    children: any;
  }

  let { title, onClose, children }: Props = $props();
</script>

<div
  class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
  onclick={onClose}
  role="dialog"
  aria-modal="true"
>
  <div
    class="obsidian-modal max-w-lg w-full mx-4"
    onclick={(e) => e.stopPropagation()}
  >
    {#if title}
      <h2 class="text-lg font-semibold mb-4 text-obsidian-fg">{title}</h2>
    {/if}
    {@render children()}
  </div>
</div>

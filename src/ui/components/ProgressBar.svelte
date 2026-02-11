<script lang="ts">
  interface Props {
    value?: number;
    max?: number;
  }

  let { value = 0, max = 100 }: Props = $props();
  let percent = $derived((value / max) * 100);
</script>

<div class="w-full bg-obsidian-bgAlt rounded-full h-2 overflow-hidden">
  <div
    class="bg-obsidian-accent h-full transition-all duration-300"
    style="width: {percent}%"
  />
</div>

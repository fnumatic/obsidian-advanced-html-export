<script lang="ts">
  interface Props {
    name: string;
    size?: string;
  }

  let { name, size = "1em" }: Props = $props();
</script>

<span class="i-carbon-{name}" style="font-size: {size}" aria-hidden="true"></span>

<script lang="ts">
  interface Props {
    name: string;
    size?: string;
    class?: string;
  }

  let { name, size = undefined, class: className = "" }: Props = $props();

  const style = size ? `font-size: ${size}` : undefined;
</script>

<span class="i-carbon-{name}{className ? ' ' + className : ''}" aria-hidden="true" style={style}></span>

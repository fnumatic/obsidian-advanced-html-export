<script lang="ts">
  interface Props {
    variant?: 'secondary' | 'primary' | 'danger';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: any;
  }

  let { variant = 'secondary', disabled = false, onclick, children }: Props = $props();
</script>

<button
  class={variant === 'primary' ? 'obsidian-btn-primary' : variant === 'danger' ? 'obsidian-btn-danger' : 'obsidian-btn'}
  {disabled}
  {onclick}
>
  {@render children()}
</button>

import { defineConfig, presetWind4, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetWind4(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/'
    }),
  ],
  rules: [
    // Backgrounds using Obsidian CSS variables
    [/^bg-obsidian$/, () => ({ 'background-color': 'var(--background-primary)' })],
    [/^bg-obsidian-alt$/, () => ({ 'background-color': 'var(--background-modifier-form-field)' })],

    // Text colors using Obsidian CSS variables
    [/^text-obsidian$/, () => ({ color: 'var(--text-normal)' })],
    [/^text-obsidian-muted$/, () => ({ color: 'var(--text-muted)' })],
    [/^text-obsidian-accent$/, () => ({ color: 'var(--interactive-accent)' })],

    // Borders using Obsidian CSS variables
    [/^border-obsidian$/, () => ({ 'border-color': 'var(--background-modifier-border)' })],

    // Hover states using Obsidian CSS variables
    [/^hover:bg-obsidian-hover$/, () => ({ 'background-color': 'var(--interactive-hover)' })],
    [/^hover:text-obsidian-accent$/, () => ({ color: 'var(--interactive-accent)' })],
  ],
  shortcuts: {
    'obsidian-btn': 'px-3 py-1.5 rounded cursor-pointer transition-colors',
    'obsidian-btn-primary': 'px-3 py-1.5 rounded cursor-pointer transition-opacity bg-[var(--interactive-accent)] text-[var(--text-on-accent)]',
    'obsidian-btn-danger': 'px-3 py-1.5 rounded cursor-pointer transition-opacity bg-[var(--text-error)] text-white',
    'obsidian-modal': 'bg-[var(--background-primary)] border-[var(--background-modifier-border)] rounded-lg shadow-xl p-4',
    'obsidian-input': 'w-full px-3 py-1.5 rounded outline-none bg-[var(--background-primary)] border-[var(--background-modifier-border)] text-[var(--text-normal)]',
  }
})

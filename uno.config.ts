import { defineConfig, presetWind4, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetWind4(),
    presetIcons({
      scale: 1.2,
      collections: {
        carbon: () => import('@iconify-json/carbon').then(i => i.icons)
      },
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle'
      }
    }),
  ],
   safelist: [
    'i-carbon-chart-bar',
    'i-carbon-code-block',
    'i-carbon-document',
    'i-carbon-hourglass',
    'i-carbon-image',
    'i-carbon-lightning',
    'i-carbon-link',
    'i-carbon-pause',
    'i-carbon-play',
    'i-carbon-timer',
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
    // Obsidian-themed utilities not covered by the rules above.
    // Fixed pixel font sizes (no zoom scaling)
    'text-obsidian': 'text-14px',
    'text-obsidian-sm': 'text-12px',
    'text-obsidian-xs': 'text-11px',
    // Document list item statistics (number/icon columns)
    'note-list-item-left': 'py-1 px-2 flex items-center',
    'note-list-stats': 'flex gap-1',
    'note-list-stat': 'flex items-center gap-0.5',
    'note-list-stat-number': 'text-right tabular-nums min-w-[2ch] w-[2ch]',
  }
})

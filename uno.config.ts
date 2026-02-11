import { defineConfig, presetWind4, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetWind4(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/'
    }),
  ],
  shortcuts: {
    'obsidian-btn': 'px-3 py-1.5 rounded cursor-pointer transition-colors',
    'obsidian-btn-primary': 'px-3 py-1.5 rounded cursor-pointer transition-opacity',
    'obsidian-btn-danger': 'px-3 py-1.5 rounded cursor-pointer transition-opacity',
    'obsidian-modal': 'bg-obsidian border-obsidian rounded-lg shadow-xl p-4',
    'obsidian-input': 'w-full px-3 py-1.5 rounded outline-none',
  }
})

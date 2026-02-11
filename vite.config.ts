import { defineConfig } from 'vite'
import { resolve } from 'path'
import { builtinModules } from 'module'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import UnoCSS from '@unocss/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isVitest = Boolean(process.env.VITEST)

export default defineConfig({
  plugins: [
    UnoCSS({
      configFile: resolve(__dirname, 'uno.config.ts')
    }),
    svelte()
  ],
  resolve: {
    alias: {
      'src': resolve(__dirname, 'src'),
      ...(isVitest ? { 'virtual:uno.css': resolve(__dirname, 'src/__mocks__/virtual-uno.css') } : {})
    },
    conditions: ['browser', 'default']
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.js',
      cssFileName: 'styles'
    },
    minify: 'esbuild',
    rollupOptions: {
      external: [
        'obsidian',
        'electron',
        'codemirror',
        '@codemirror/autocomplete',
        '@codemirror/closebrackets',
        '@codemirror/collab',
        '@codemirror/commands',
        '@codemirror/comment',
        '@codemirror/fold',
        '@codemirror/gutter',
        '@codemirror/highlight',
        '@codemirror/history',
        '@codemirror/language',
        '@codemirror/lint',
        '@codemirror/matchbrackets',
        '@codemirror/panel',
        '@codemirror/rangeset',
        '@codemirror/rectangular-selection',
        '@codemirror/search',
        '@codemirror/state',
        '@codemirror/stream-parser',
        '@codemirror/text',
        '@codemirror/tooltip',
        '@codemirror/view',
        '@lezer/common',
        '@lezer/lr',
        ...builtinModules
      ]
    },
    target: 'node14',
    sourcemap: false,
    emptyOutDir: true
  }
})

import { defineConfig } from 'vite'
import { resolve } from 'path'
import { builtinModules } from 'module'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import extractorSvelte from '@unocss/extractor-svelte'
import UnoCSS from '@unocss/vite'
import UnoCSSConfig from './uno.config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isVitest = Boolean(process.env.VITEST)

export default defineConfig({
  plugins: [
    UnoCSS({
      ...UnoCSSConfig,
      extractors: [extractorSvelte()],
    }),
    svelte({
      compilerOptions: {
        runes: true
      }
    }),
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

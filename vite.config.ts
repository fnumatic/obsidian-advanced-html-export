import { defineConfig } from 'vite'
import { resolve } from 'path'
import { builtinModules } from 'module'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import UnoCSS from '@unocss/vite'
import UnoCSSConfig from './uno.config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isVitest = Boolean(process.env.VITEST)

export default defineConfig({
  plugins: [
    UnoCSS({
      ...UnoCSSConfig,
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
        ...builtinModules
      ]
    },
    target: 'node14',
    sourcemap: false,
    emptyOutDir: true
  }
})

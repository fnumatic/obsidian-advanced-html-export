import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      'obsidian': resolve(__dirname, 'src/__mocks__/obsidian.ts')
    }
  },
  test: {
    globals: true,
    environment: 'node'
  }
})
#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { build } = require('vite')
const { loadVaultPath, findObsidianVaults } = require('./utils')

// Get plugin name from package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const pluginName = packageJson.name

async function main() {
  let vaultPath = loadVaultPath()

  if (!vaultPath) {
    console.log('🔍 Scanning for Obsidian vaults...')
    const vaults = findObsidianVaults()
    if (vaults.length === 0) {
      console.error('❌ No vaults found')
      process.exit(1)
    }
    vaultPath = vaults[0] // Use first available vault as default
    console.log(`Using default vault: ${vaultPath}`)
  } else {
    console.log(`Using saved vault: ${vaultPath}`)
  }

  console.log(`Starting dev server with vault: ${vaultPath}`)

  try {
    await build({
      configFile: path.join(__dirname, '..', 'vite.config.ts'),
      mode: 'development',
      build: {
        watch: {},
        sourcemap: 'inline'
      },
      plugins: [
        {
          name: 'copy-to-vault',
          writeBundle() {
            const { copyPluginToVault } = require('./utils')
            copyPluginToVault(vaultPath, pluginName)
          }
        }
      ]
    })
  } catch (error) {
    console.error('Build error:', error)
    process.exit(1)
  }
}

main().catch(console.error)
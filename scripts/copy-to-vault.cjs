#!/usr/bin/env node

const fs = require('fs')
const { build } = require('vite')
const { findObsidianVaults, loadVaultPath, saveVaultPath, promptUser, copyPluginToVault } = require('./utils.cjs')

// Get plugin name from package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const pluginName = packageJson.name

async function main() {
  console.log('🔨 Building plugin...')

  try {
    await build({
      configFile: 'vite.config.ts',
      mode: 'production'
    })
  } catch (error) {
    console.error('Build error:', error)
    process.exit(1)
  }

  console.log('🔍 Scanning for Obsidian vaults...')

  const vaults = findObsidianVaults()

  if (vaults.length === 0) {
    console.log('❌ No Obsidian vaults found. Please make sure you have Obsidian installed and have opened at least one vault.')
    process.exit(1)
  }

  console.log(`✅ Found ${vaults.length} vault(s):`)

  const formerVault = loadVaultPath()
  const vaultPath = await promptUser('Select a vault to copy the plugin to:', vaults, formerVault)
  saveVaultPath(vaultPath)

  console.log(`Copying plugin "${pluginName}" to vault: ${vaultPath}`)
  copyPluginToVault(vaultPath, pluginName)
}

main().catch(console.error)
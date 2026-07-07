#!/usr/bin/env node

const fs = require('fs')
const { build } = require('vite')
const { findObsidianVaults, loadVaultPath, saveVaultPath, promptUser, copyPluginToVault, getPluginId } = require('./utils.cjs')

// Get plugin id from manifest.json (used by Obsidian for plugin folder name)
const pluginName = getPluginId()

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
import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import "./styles.css";
import { ExportSingleFileCommand } from "./commands/exportSingleFile";
import { ExportWikiCommand } from "./commands/exportWiki";

interface AdvancedHtmlExportSettings {
  imageQuality: 'high' | 'medium' | 'low';
  enableLazyLoading: boolean;
  enableImageDeduplication: boolean;
  linkDepth: number;
  wikiTitle: string;
  enableThemeToggle: boolean;
  enableInlineTOC: boolean;
  defaultTheme: 'light' | 'dark';
}

const DEFAULT_SETTINGS: AdvancedHtmlExportSettings = {
  imageQuality: 'medium',
  enableLazyLoading: true,
  enableImageDeduplication: true,
  linkDepth: 1,
  wikiTitle: '',
  enableThemeToggle: true,
  enableInlineTOC: true,
  defaultTheme: 'light'
}

export default class AdvancedHtmlExportPlugin extends Plugin {
  settings: AdvancedHtmlExportSettings;

  onload = async () => {
    console.log("Advanced HTML Export Plugin: Version 0.0.4 initialized");

    await this.loadSettings();

    // Add export single file command
    const exportCommand = new ExportSingleFileCommand(this.app, this);
    this.addCommand({
      id: 'export-current-file-as-html',
      name: 'Export Current File as HTML',
      callback: () => {
        exportCommand.execute();
      }
    });

    // Add export wiki command
    const exportWikiCommand = new ExportWikiCommand(this.app, this);
    this.addCommand({
      id: 'export-wiki-as-html',
      name: 'Export Wiki as HTML',
      callback: () => {
        exportWikiCommand.execute();
      }
    });

    // Add settings tab
    this.addSettingTab(new AdvancedHtmlExportSettingTab(this.app, this));
  };

  onunload = () => {
    console.log("unloading advanced html export plugin");
  };

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class AdvancedHtmlExportSettingTab extends PluginSettingTab {
  plugin: AdvancedHtmlExportPlugin;

  constructor(app: App, plugin: AdvancedHtmlExportPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Advanced HTML Export Settings' });

    new Setting(containerEl)
      .setName('Image Quality')
      .setDesc('Quality level for image optimization (higher quality = larger file size)')
      .addDropdown(dropdown => dropdown
        .addOption('high', 'High (90%)')
        .addOption('medium', 'Medium (80%)')
        .addOption('low', 'Low (70%)')
        .setValue(this.plugin.settings.imageQuality)
        .onChange(async (value: 'high' | 'medium' | 'low') => {
          this.plugin.settings.imageQuality = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Enable Lazy Loading')
      .setDesc('Defer loading of images that are not immediately visible')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableLazyLoading)
        .onChange(async (value) => {
          this.plugin.settings.enableLazyLoading = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Enable Image Deduplication')
      .setDesc('Reduce file size by embedding identical images only once using JavaScript (recommended)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableImageDeduplication)
        .onChange(async (value) => {
          this.plugin.settings.enableImageDeduplication = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Wiki Link Depth')
      .setDesc('How many levels of links to include in wiki export (1 = direct links only)')
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.linkDepth)
        .onChange(async (value) => {
          this.plugin.settings.linkDepth = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Wiki Title')
      .setDesc('Custom title for wiki export (leave empty to use note title)')
      .addText(text => text
        .setPlaceholder('My Wiki')
        .setValue(this.plugin.settings.wikiTitle)
        .onChange(async (value) => {
          this.plugin.settings.wikiTitle = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Enable Theme Toggle')
      .setDesc('Show theme toggle button to switch between light and dark mode')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableThemeToggle)
        .onChange(async (value) => {
          this.plugin.settings.enableThemeToggle = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Enable Inline Table of Contents')
      .setDesc('Show inline TOC on the right side of the content')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableInlineTOC)
        .onChange(async (value) => {
          this.plugin.settings.enableInlineTOC = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Default Theme')
      .setDesc('Default theme for wiki export')
      .addDropdown(dropdown => dropdown
        .addOption('light', 'Light')
        .addOption('dark', 'Dark')
        .setValue(this.plugin.settings.defaultTheme)
        .onChange(async (value: 'light' | 'dark') => {
          this.plugin.settings.defaultTheme = value;
          await this.plugin.saveSettings();
        }));
  }
}

import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import "virtual:uno.css";
import "./styles.css";
import "./ui/styles/uno-shortcuts.css";
import "./ui/styles/obsidian-tokens.css";
import { ExportSingleFileCommand } from "./commands/exportSingleFile";
import { ExportWikiCommand } from "./commands/exportWiki";
import { DEFAULT_SETTINGS, type AdvancedHtmlExportSettings } from "./settings";

declare global {
  interface Window {
    ADVANCED_HTML_EXPORT_DEBUG: boolean;
  }
}

type BooleanSettingKey =
  | 'enableLazyLoading'
  | 'enableImageDeduplication'
  | 'showExportStatistics'
  | 'enableThemeToggle'
  | 'enableInlineTOC'
  | 'disableSyntaxHighlighting';

type TextSettingKey = 'wikiTitle' | 'exportAuthor' | 'syntaxHighlightLanguages';

type DropdownSettingKey = 'imageQuality' | 'exportCompression' | 'defaultTheme';

export default class AdvancedHtmlExportPlugin extends Plugin {
  settings!: AdvancedHtmlExportSettings;

  onload = async () => {
    await this.loadSettings();

    // Add export single file command
    const exportCommand = new ExportSingleFileCommand(this.app, this);
    this.addCommand({
      id: 'export-current-file-as-html',
      name: 'Export current file as HTML',
      callback: () => {
        void exportCommand.execute();
      }
    });

    // Add export wiki command
    const exportWikiCommand = new ExportWikiCommand(this.app, this);
    this.addCommand({
      id: 'export-wiki-as-html',
      name: 'Export wiki as HTML',
      callback: () => {
        void exportWikiCommand.execute();
      }
    });

    // Add settings tab
    this.addSettingTab(new AdvancedHtmlExportSettingTab(this.app, this));
  };

  onunload = () => {
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
    this.containerEl.empty();

    this.addHeading('Export options');

    this.addDropdown('Image quality', 'Quality level for image optimization (higher quality = larger file size)', 'imageQuality', [
      ['high', 'High (90%)'],
      ['medium', 'Medium (80%)'],
      ['low', 'Low (70%)'],
    ]);

    this.addToggle('Enable lazy loading', 'Defer loading of images that are not immediately visible', 'enableLazyLoading');

    this.addToggle('Enable image deduplication', 'Reduce file size by embedding identical images only once using JavaScript (recommended)', 'enableImageDeduplication');

    this.addDropdown('Export compression', 'Wrap the exported HTML in a self-extracting gzip container that unpacks itself when opened. gzip + base85 is about 6% smaller than gzip + base64. Can be overridden per start note via the "export.compression" frontmatter (none, gzipb64, gzipb85).', 'exportCompression', [
      ['none', 'None (plain HTML)'],
      ['gzipb64', 'gzip + base64'],
      ['gzipb85', 'gzip + base85 (smaller)'],
    ]);

    this.addToggle('Show export statistics', 'Show a size breakdown of the generated file after each export (what data uses how much space)', 'showExportStatistics');

    this.addSlider('Wiki link depth', 'How many levels of links to include in wiki export (1 = direct links only)', 'linkDepth', [1, 10, 1]);

    this.addText('Wiki title', 'Custom title for wiki export (leave empty to use note title)', 'wikiTitle', 'My Wiki');

    this.addText('Export author', 'Default author for exported wiki manifest. Can be overridden per note via frontmatter.', 'exportAuthor', 'Author name');

    this.addToggle('Enable theme toggle', 'Show theme toggle button to switch between light and dark mode', 'enableThemeToggle');

    this.addToggle('Enable inline table of contents', 'Show inline TOC on the right side of the content', 'enableInlineTOC');

    this.addDropdown('Default theme', 'Default theme for wiki export', 'defaultTheme', [
      ['light', 'Light'],
      ['dark', 'Dark'],
    ]);

    this.addToggle('Disable syntax highlighting', 'Export code blocks as plain text without syntax highlighting (faster export, smaller file size)', 'disableSyntaxHighlighting');

    this.addText('Languages for syntax highlighting', 'Comma-separated list of language identifiers to process. Custom blocks (mermaid, plantuml, etc.) are NOT affected.', 'syntaxHighlightLanguages', 'javascript, typescript, python, ...');

    // Debug section
    this.addHeading('Developer options');

    new Setting(this.containerEl)
      .setName('Debug mode')
      .setDesc('Enable detailed performance logging and timing measurements for exports (reload required)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.debugMode)
        .onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          await this.plugin.saveSettings();
          // Set global flag for debugLogger
          window.ADVANCED_HTML_EXPORT_DEBUG = value;
        }));
  }

  private addHeading(name: string): void {
    new Setting(this.containerEl).setName(name).setHeading();
  }

  private addToggle(name: string, desc: string, key: BooleanSettingKey): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings[key])
        .onChange(async (value) => {
          this.plugin.settings[key] = value;
          await this.plugin.saveSettings();
        }));
  }

  private addText(name: string, desc: string, key: TextSettingKey, placeholder = ''): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addText(text => text
        .setPlaceholder(placeholder)
        .setValue(this.plugin.settings[key])
        .onChange(async (value) => {
          this.plugin.settings[key] = value;
          await this.plugin.saveSettings();
        }));
  }

  private addDropdown(
    name: string,
    desc: string,
    key: DropdownSettingKey,
    options: ReadonlyArray<readonly [string, string]>,
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addDropdown(dropdown => {
        for (const [value, label] of options) {
          dropdown.addOption(value, label);
        }
        return dropdown
          .setValue(this.plugin.settings[key])
          .onChange(async (value) => {
            (this.plugin.settings as Record<DropdownSettingKey, string>)[key] = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private addSlider(name: string, desc: string, key: 'linkDepth', limits: readonly [number, number, number]): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addSlider(slider => slider
        .setLimits(limits[0], limits[1], limits[2])
        .setValue(this.plugin.settings[key])
        .onChange(async (value) => {
          this.plugin.settings[key] = value;
          await this.plugin.saveSettings();
        }));
  }
}

// Set initial debug flag on load
if (typeof window !== 'undefined') {
  window.ADVANCED_HTML_EXPORT_DEBUG = false;
}

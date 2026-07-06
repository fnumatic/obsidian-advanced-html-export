import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import "virtual:uno.css";
import "./styles.css";
import "./ui/styles/uno-shortcuts.css";
import "./ui/styles/obsidian-tokens.css";
import { ExportSingleFileCommand } from "./commands/exportSingleFile";
import { ExportWikiCommand } from "./commands/exportWiki";

declare global {
  interface Window {
    ADVANCED_HTML_EXPORT_DEBUG: boolean;
  }
}

interface AdvancedHtmlExportSettings {
  imageQuality: 'high' | 'medium' | 'low';
  enableLazyLoading: boolean;
  enableImageDeduplication: boolean;
  linkDepth: number;
  includeUnlinked: boolean;
  wikiTitle: string;
  enableThemeToggle: boolean;
  enableInlineTOC: boolean;
  defaultTheme: 'light' | 'dark';
  debugMode: boolean;
  disableSyntaxHighlighting: boolean;
  syntaxHighlightLanguages: string;
}

const DEFAULT_LANGUAGES = 'javascript,typescript,jsx,tsx,html,xml,css,scss,sass,c,cpp,c++,h,hpp,c#,csharp,cs,java,rust,go,ruby,swift,kotlin,scala,objective-c,objectivec,objc,python,py,perl,php,lua,raku,bash,sh,shell,powershell,ps1,cmd,batch,awk,tcl,json,jsonc,json5,yaml,yml,ini,toml,sql,pgsql,postgresql,mysql,sqlite,haskell,ocaml,fsharp,erlang,elixir,clojure,dart,flutter,groovy,gradle,maven,dockerfile,docker,cmake,makefile,markdown,md,latex,tex,asciidoc,adoc,protobuf,proto,thrift,graphql,diff,patch,vim,nginx,apache,apacheconf,lighttpd,terraform,hcl,ansible,puppet,r,julia,matlab,octave,vb,vbnet,vba,vbscript,basic,pascal,delphi,lazarus,fpc';

const DEFAULT_SETTINGS: AdvancedHtmlExportSettings = {
  imageQuality: 'medium',
  enableLazyLoading: true,
  enableImageDeduplication: true,
  linkDepth: 1,
  includeUnlinked: false,
  wikiTitle: '',
  enableThemeToggle: true,
  enableInlineTOC: true,
  defaultTheme: 'light',
  debugMode: false,
  disableSyntaxHighlighting: true,
  syntaxHighlightLanguages: DEFAULT_LANGUAGES
}

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
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Export options')
      .setHeading();

    new Setting(containerEl)
      .setName('Image quality')
      .setDesc('Quality level for image optimization (higher quality = larger file size)')
      .addDropdown(dropdown => dropdown
        .addOption('high', 'High (90%)')
        .addOption('medium', 'Medium (80%)')
        .addOption('low', 'Low (70%)')
        .setValue(this.plugin.settings.imageQuality)
        .onChange(async (value: string) => {
          this.plugin.settings.imageQuality = value as 'high' | 'medium' | 'low';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Enable lazy loading')
      .setDesc('Defer loading of images that are not immediately visible')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableLazyLoading)
        .onChange(async (value) => {
          this.plugin.settings.enableLazyLoading = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Enable image deduplication')
      .setDesc('Reduce file size by embedding identical images only once using JavaScript (recommended)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableImageDeduplication)
        .onChange(async (value) => {
          this.plugin.settings.enableImageDeduplication = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Wiki link depth')
      .setDesc('How many levels of links to include in wiki export (1 = direct links only)')
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.linkDepth)
        .onChange(async (value) => {
          this.plugin.settings.linkDepth = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Wiki title')
      .setDesc('Custom title for wiki export (leave empty to use note title)')
      .addText(text => text
        .setPlaceholder('My Wiki')
        .setValue(this.plugin.settings.wikiTitle)
        .onChange(async (value) => {
          this.plugin.settings.wikiTitle = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Enable theme toggle')
      .setDesc('Show theme toggle button to switch between light and dark mode')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableThemeToggle)
        .onChange(async (value) => {
          this.plugin.settings.enableThemeToggle = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Enable inline table of contents')
      .setDesc('Show inline TOC on the right side of the content')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enableInlineTOC)
        .onChange(async (value) => {
          this.plugin.settings.enableInlineTOC = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Default theme')
      .setDesc('Default theme for wiki export')
      .addDropdown(dropdown => dropdown
        .addOption('light', 'Light')
        .addOption('dark', 'Dark')
        .setValue(this.plugin.settings.defaultTheme)
        .onChange(async (value: string) => {
          this.plugin.settings.defaultTheme = value as 'light' | 'dark';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Disable syntax highlighting')
      .setDesc('Export code blocks as plain text without syntax highlighting (faster export, smaller file size)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.disableSyntaxHighlighting)
        .onChange(async (value) => {
          this.plugin.settings.disableSyntaxHighlighting = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Languages for syntax highlighting')
      .setDesc('Comma-separated list of language identifiers to process. Custom blocks (mermaid, plantuml, etc.) are NOT affected.')
      .addText(text => text
        .setPlaceholder('javascript, typescript, python, ...')
        .setValue(this.plugin.settings.syntaxHighlightLanguages)
        .onChange(async (value) => {
          this.plugin.settings.syntaxHighlightLanguages = value;
          await this.plugin.saveSettings();
        }));

    // Debug section
    new Setting(containerEl)
      .setName('Developer options')
      .setHeading();

    new Setting(containerEl)
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
}

// Set initial debug flag on load
if (typeof window !== 'undefined') {
  window.ADVANCED_HTML_EXPORT_DEBUG = false;
}

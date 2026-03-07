// Mock obsidian API for testing
export class Plugin {
  app: any;
  manifest: any;
  commands: any[] = [];

  constructor(app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  addCommand(command: any) {
    this.commands.push(command);
  }

  async onload(this: void) {}
  onunload(this: void) {}
}

export class Modal {
  app: any;
  contentEl: HTMLElement;
  
  constructor(app: any) {
    this.app = app;
    this.contentEl = document.createElement('div');
  }

  open(this: void) {}
  close(this: void) {}
  onOpen(this: void) {}
  onClose(this: void) {}
}

export class Notice {
  message: string;
  
  constructor(message: string, _duration?: number) {
    this.message = message;
  }

  setMessage(message: string) {
    this.message = message;
  }

  hide() {}
}

export class TFile {
  path: string = '';
  basename: string = '';
  extension: string = '';
  stat: { mtime: number } = { mtime: 0 };
  name: string = '';
}

export class App {
  vault: any = {};
  workspace: any = {};
}

export class Component {
  load(this: void) {}
  unload(this: void) {}
}

export class MarkdownRenderer {
  static async render(_app: any, _markdown: string, el: HTMLElement, _sourcePath: string, _component: any) {
    el.innerHTML = '<p>Mock rendered content</p>';
  }
}

export class PluginSettingTab {
  app: App;
  plugin: any;
  containerEl: HTMLElement;
  
  constructor(app: App, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }
  
  display(this: void) {}
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}
  
  setName(_name: string) { return this; }
  setDesc(_desc: string) { return this; }
  addDropdown(_cb: any) { return this; }
  addToggle(_cb: any) { return this; }
  addSlider(_cb: any) { return this; }
  addText(_cb: any) { return this; }
}

export class ButtonComponent {
  constructor(_containerEl: HTMLElement) {}
  
  setButtonText(_text: string) { return this; }
  setCta() { return this; }
  setWarning() { return this; }
  onClick(_cb: () => void) { return this; }
}

export class TextComponent {
  inputEl: HTMLInputElement;
  
  constructor(_containerEl: HTMLElement) {
    this.inputEl = document.createElement('input');
  }
  
  setPlaceholder(_placeholder: string) { return this; }
  onChange(_cb: (value: string) => void) { return this; }
}

export function arrayBufferToBase64(_buffer: ArrayBuffer): string {
  return '';
}

export default {};

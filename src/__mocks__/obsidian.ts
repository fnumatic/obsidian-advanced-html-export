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

  async onload() {}
  onunload() {}
}

export default {};
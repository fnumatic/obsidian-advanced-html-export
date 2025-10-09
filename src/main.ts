import { Plugin } from "obsidian";
import "./styles.css";
import { ExportSingleFileCommand } from "./commands/exportSingleFile";

export default class AdvancedHtmlExportPlugin extends Plugin {
  onload = async () => {
    console.log("Advanced HTML Export Plugin: Loading started");
    console.log("Advanced HTML Export Plugin: Version 0.0.3 initialized");
    console.log("loading advanced html export plugin");

    // Add export single file command
    const exportCommand = new ExportSingleFileCommand(this.app, this);
    this.addCommand({
      id: 'export-current-file-as-html',
      name: 'Export Current File as HTML',
      callback: () => {
        exportCommand.execute();
      }
    });
  };

}

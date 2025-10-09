import { Plugin } from "obsidian";
import "./styles.css";
import { ExportSingleFileCommand } from "./commands/exportSingleFile";

export default class TestPlugin extends Plugin {
  onload = async () => {
    console.log("Test Plugin: Loading started");
    console.log("Test Plugin: Version 0.0.1 initialized");
    console.log("loading test plugin");

    // Add test command
    this.addCommand({
      id: 'test-log-command',
      name: 'Test Log Command',
      callback: () => {
        console.log("Test Plugin: Command executed successfully");
        console.log("Test Plugin: Current timestamp:", new Date().toISOString());
      }
    });

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

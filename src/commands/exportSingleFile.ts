import { App, Notice, TFile } from 'obsidian';
import type AdvancedHtmlExportPlugin from '../main';
import HtmlRenderer from '../utils/htmlRenderer';
import { downloadBlob, generateSafeFilename } from '../utils/fileUtils';

/**
 * Command to export the currently active file as HTML
 */
export class ExportSingleFileCommand {
  private app: App;
  private plugin: AdvancedHtmlExportPlugin;

  constructor(app: App, plugin: AdvancedHtmlExportPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  /**
   * Executes the export command
   */
  async execute(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile) {
      new Notice('No active file to export. Please open a file first.');
      return;
    }

    if (!(activeFile instanceof TFile)) {
      new Notice('Active file is not a valid file type.');
      return;
    }

    try {
      // Show progress notice
      const progressNotice = new Notice('Exporting file as HTML...', 0);

      // Read file content
      const content = await this.app.vault.cachedRead(activeFile);

      // Create HTML renderer
      const htmlRenderer = new HtmlRenderer(this.app, this.plugin, {
        imageQuality: this.plugin.settings.imageQuality,
        enableLazyLoading: this.plugin.settings.enableLazyLoading,
        enableImageDeduplication: this.plugin.settings.enableImageDeduplication,
        disableSyntaxHighlighting: this.plugin.settings.disableSyntaxHighlighting !== false
      });

      // Render markdown to HTML
      const htmlContent = await htmlRenderer.render(content);

      // Create complete HTML document
      const fullHtml = this.createHtmlDocument(htmlContent, activeFile.basename);

      // Create blob and download
      const blob = new Blob([fullHtml], { type: 'text/html' });
      const filename = generateSafeFilename(activeFile.path, 'html');

      downloadBlob(blob, filename);

      // Update progress notice
      progressNotice.hide();
      new Notice(`File exported as ${filename}`);

    } catch (error) {
      console.error('Error exporting file:', error);
      new Notice(`Failed to export file: ${error.message}`);
    }
  }

  /**
   * Creates a complete HTML document with embedded CSS
   * @param content The rendered HTML content
   * @param title The document title
   * @returns Complete HTML document as string
   */
  private createHtmlDocument(content: string, title: string): string {
    const css = this.getEmbeddedCss();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Exported</title>
    <style>
${css}
    </style>
</head>
<body class="markdown-body">
    ${content}
</body>
</html>`;
  }

  /**
   * Returns the embedded CSS for clean HTML output
   * Based on GitHub Markdown CSS with customizations
   */
  private getEmbeddedCss(): string {
    return `
/* GitHub Markdown CSS with customizations for Obsidian export */
.markdown-body {
  -ms-text-size-adjust: 100%;
  -webkit-text-size-adjust: 100%;
  margin: 0 auto;
  padding: 45px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  font-size: 16px;
  line-height: 1.6;
  word-wrap: break-word;
  box-sizing: border-box;
  color: #24292f;
  background-color: #ffffff;
  max-width: 980px;
}

@media (max-width: 767px) {
  .markdown-body {
    padding: 15px;
  }
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-body h1 {
  padding-bottom: 0.3em;
  font-size: 2em;
  border-bottom: 1px solid #d1d9e0;
}

.markdown-body h2 {
  padding-bottom: 0.3em;
  font-size: 1.5em;
  border-bottom: 1px solid #d1d9e0;
}

.markdown-body h3 {
  font-size: 1.25em;
}

.markdown-body h4 {
  font-size: 1em;
}

.markdown-body h5 {
  font-size: 0.875em;
}

.markdown-body h6 {
  font-size: 0.85em;
  color: #656d76;
}

.markdown-body p {
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-body blockquote {
  margin: 0 0 16px 0;
  padding: 0 1em;
  color: #656d76;
  border-left: 0.25em solid #d1d9e0;
}

.markdown-body ul,
.markdown-body ol {
  margin-top: 0;
  margin-bottom: 16px;
  padding-left: 2em;
}

.markdown-body ul {
  list-style-type: disc;
}

.markdown-body ol {
  list-style-type: decimal;
}

.markdown-body li {
  margin-top: 0.25em;
}

.markdown-body code {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background-color: #f6f8fa;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
}

.markdown-body pre {
  margin-top: 0;
  margin-bottom: 16px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 85%;
  line-height: 1.45;
  overflow: auto;
  padding: 16px;
  background-color: #f6f8fa;
  border-radius: 6px;
}

.markdown-body pre code {
  background-color: transparent;
  padding: 0;
  margin: 0;
  border: 0;
  font-size: 100%;
}

.markdown-body img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

.markdown-body table {
  border-spacing: 0;
  border-collapse: collapse;
  margin-top: 0;
  margin-bottom: 16px;
  width: 100%;
}

.markdown-body table th,
.markdown-body table td {
  padding: 6px 13px;
  border: 1px solid #d1d9e0;
}

.markdown-body table th {
  font-weight: 600;
  background-color: #f6f8fa;
}

.markdown-body a {
  color: #0969da;
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: #d1d9e0;
  border: 0;
}

.markdown-body strong {
  font-weight: 600;
}

.markdown-body em {
  font-style: italic;
}
`;
  }
}
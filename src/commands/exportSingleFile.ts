import { App, Notice, TFile } from 'obsidian';
import type AdvancedHtmlExportPlugin from '../main';
import HtmlRenderer from '../utils/htmlRenderer';
import { downloadBlob, generateSafeFilename } from '../utils/fileUtils';
import { wrapHtmlForExportWithMeta, resolveCompressionMode } from '../utils/selfExtract';
import { ExportSizeLedger } from '../utils/exportSizeLedger';
import { createNoteArtifact, utf8ByteLength } from '../utils/exportSizeReport';
import { ExportStatisticsModal } from '../ui/modals/ExportStatisticsModal';
import { fillTemplate } from '../utils/templateUtils';
import singleFileTemplate from '../utils/singleFileTemplates/template.html?raw';
import singleFileStyles from '../utils/singleFileTemplates/styles.css?raw';

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

      // Create HTML renderer with size accounting
      const ledger = new ExportSizeLedger();
      const htmlRenderer = new HtmlRenderer(this.app, this.plugin, {
        imageQuality: this.plugin.settings.imageQuality,
        enableLazyLoading: this.plugin.settings.enableLazyLoading,
        enableImageDeduplication: this.plugin.settings.enableImageDeduplication,
        disableSyntaxHighlighting: this.plugin.settings.disableSyntaxHighlighting !== false
      });
      htmlRenderer.setSizeLedger(ledger);
      ledger.recordNoteSource(activeFile.stat?.size ?? utf8ByteLength(content));

      // Render markdown to HTML
      const htmlContent = await htmlRenderer.render(content, activeFile.basename);

      // Create complete HTML document
      const fullHtml = this.createHtmlDocument(htmlContent, activeFile.basename);
      ledger.setShell({ cssBytes: utf8ByteLength(singleFileStyles), jsBytes: 0 });
      ledger.recordArtifact(createNoteArtifact(activeFile.basename, htmlContent));

      // Create blob and download
      const frontmatterExport = this.app.metadataCache.getFileCache(activeFile)?.frontmatter?.export as
        { compression?: unknown } | undefined;
      const compression = resolveCompressionMode(
        frontmatterExport?.compression,
        this.plugin.settings.exportCompression
      );
      const { html: outputHtml, meta } = wrapHtmlForExportWithMeta(
        fullHtml,
        compression,
        activeFile.basename
      );
      ledger.applyCompression(meta);
      const blob = new Blob([outputHtml], { type: 'text/html' });
      const filename = generateSafeFilename(activeFile.path, 'html');

      downloadBlob(blob, filename);

      // Update progress notice
      progressNotice.hide();
      new Notice(`File exported as ${filename}`);

      if (this.plugin.settings.showExportStatistics) {
        new ExportStatisticsModal(this.app, ledger.finalize()).open();
      }

    } catch (error) {
      console.error('Error exporting file:', error);
      const msg = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to export file: ${msg}`);
    }
  }

  /**
   * Creates a complete HTML document with embedded CSS
   * @param content The rendered HTML content
   * @param title The document title
   * @returns Complete HTML document as string
   */
  private createHtmlDocument(content: string, title: string): string {
    return fillTemplate(singleFileTemplate, {
      TITLE: title,
      STYLES: singleFileStyles,
      CONTENT: content,
    });
  }
}

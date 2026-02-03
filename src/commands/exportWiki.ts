import { App, Notice, TFile } from 'obsidian';
import WikiHtmlRenderer, { WikiRenderOptions } from '../utils/wikiHtmlRenderer';
import { downloadBlob, sanitizeFilename } from '../utils/fileUtils';

export class ExportWikiCommand {
    private app: App;
    private plugin: any;

    constructor(app: App, plugin: any) {
        this.app = app;
        this.plugin = plugin;
    }

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

        await this.executeWithFile(activeFile);
    }

    async executeWithFile(file: TFile): Promise<void> {
        try {
            const progressNotice = new Notice('Collecting linked notes...', 0);

            const options: WikiRenderOptions = {
                imageQuality: this.plugin.settings.imageQuality,
                enableLazyLoading: this.plugin.settings.enableLazyLoading,
                enableImageDeduplication: this.plugin.settings.enableImageDeduplication,
                linkDepth: this.plugin.settings.linkDepth || 1,
                includeUnlinked: this.plugin.settings.includeUnlinked || false,
                wikiTitle: this.plugin.settings.wikiTitle || ''
            };

            const wikiRenderer = new WikiHtmlRenderer(this.app, this.plugin, options);

            const progressCallback = (current: number, total: number) => {
                progressNotice.setMessage(`Rendering note ${current}/${total}...`);
            };

            const htmlContent = await wikiRenderer.renderWiki(file, progressCallback);

            const fullHtml = this.createHtmlDocument(htmlContent);

            const blob = new Blob([fullHtml], { type: 'text/html' });
            const filename = this.generateWikiFilename(file.path);

            downloadBlob(blob, filename);

            progressNotice.hide();
            new Notice(`Wiki exported as ${filename}`);

        } catch (error) {
            console.error('Error exporting wiki:', error);
            new Notice(`Failed to export wiki: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private createHtmlDocument(content: string): string {
        return `${content}`;
    }

    private generateWikiFilename(filePath: string): string {
        const baseName = filePath.split('/').pop()?.split('.')[0] || 'wiki';
        const sanitized = sanitizeFilename(baseName);
        return `${sanitized}-wiki.html`;
    }
}

import { App, Notice, TFile } from 'obsidian';
import type AdvancedHtmlExportPlugin from '../main';
import { WikiRenderOptions } from '../utils/wikiHtmlRenderer';
import { WikiExportOrchestrator, NoteInfo, ExportMetrics } from '../utils/wikiExportOrchestrator';
import { ExportPreviewModal } from '../ui/modals/ExportPreviewModal';
import { NoteSelectionModal } from '../ui/modals/NoteSelectionModal';
import { RenderingProgressModal } from '../ui/modals/RenderingProgressModal';
import { downloadBlob, sanitizeFilename } from '../utils/fileUtils';
import { wrapHtmlForExportWithMeta, resolveCompressionMode, type CompressionMode } from '../utils/selfExtract';
import { ExportSizeLedger } from '../utils/exportSizeLedger';
import { createNoteArtifact } from '../utils/exportSizeReport';
import { ExportStatisticsModal } from '../ui/modals/ExportStatisticsModal';
import { debugLogger } from '../utils/debugLogger';
import { CancellationToken, CancellationError } from '../utils/cancellationToken';
import { PauseController } from '../utils/pauseController';
import { DetailedWikiRenderer } from '../utils/detailedRenderer';

export class ExportWikiCommand {
    private app: App;
    private plugin: AdvancedHtmlExportPlugin;

    constructor(app: App, plugin: AdvancedHtmlExportPlugin) {
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
        const collectingNotice = new Notice('Collecting linked notes...', 0);

        try {
            const options = this.buildRenderOptions();
            const orchestrator = new WikiExportOrchestrator(this.app, this.plugin, options);

            // Phase 1: Collect notes (fast - just metadata)
            const collectedNotes = await orchestrator.collectNotes(file);
            collectingNotice.hide();

            if (collectedNotes.length === 0) {
                new Notice('No notes found to export.');
                return;
            }

            const metrics = orchestrator.getMetrics();
            if (!metrics) {
                new Notice('Error calculating metrics.');
                return;
            }

            // Phase 2/3: Preview and note selection
            const selectedNotes = await this.chooseNotes(collectedNotes, metrics);
            if (!selectedNotes) {
                new Notice('Export cancelled.');
                return;
            }
            orchestrator.setSelectedNotes(selectedNotes);

            // Phase 4: Render selected notes with detailed progress
            const token = new CancellationToken();
            const pauseController = new PauseController();
            const progressModal = new RenderingProgressModal(this.app, token, pauseController, metrics, selectedNotes);
            const ledger = new ExportSizeLedger();
            for (const note of selectedNotes) {
                ledger.recordNoteSource(note.file.stat?.size ?? 0);
            }

            const renderPromise = this.performRendering(orchestrator, selectedNotes, options, token, pauseController, progressModal, ledger);
            const rendered = await progressModal.openAndAwait();
            if (!rendered) {
                new Notice('Export cancelled by user.');
                return;
            }

            const { renderedPages, renderer } = await renderPromise;

            // Record per-note artifacts (excluding inline images, which are
            // listed separately) for the largest-artifacts ranking.
            for (const note of selectedNotes) {
                const pageHtml = renderedPages.get(note.slug);
                if (pageHtml !== undefined) {
                    ledger.recordArtifact(createNoteArtifact(note.title, pageHtml));
                }
            }

            const htmlContent = renderer.generateWikiHtmlWithRenderedPages(
                file,
                renderedPages,
                selectedNotes.map(n => ({ slug: n.slug, title: n.title, path: n.path }))
            );

            this.deliverExport(file, htmlContent, ledger);

            // Export debug log if in debug mode
            debugLogger.exportToFile();

        } catch (error) {
            if (error instanceof CancellationError) {
                new Notice('Export cancelled by user.');
                return;
            }
            console.error('Error exporting wiki:', error);
            new Notice(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /** Builds the render options shared by the orchestrator and the renderer. */
    private buildRenderOptions(): WikiRenderOptions {
        return {
            imageQuality: this.plugin.settings.imageQuality,
            enableLazyLoading: this.plugin.settings.enableLazyLoading,
            enableImageDeduplication: this.plugin.settings.enableImageDeduplication,
            linkDepth: this.plugin.settings.linkDepth || 1,
            includeUnlinked: this.plugin.settings.includeUnlinked || false,
            wikiTitle: this.plugin.settings.wikiTitle || '',
            disableSyntaxHighlighting: this.plugin.settings.disableSyntaxHighlighting !== false,
            exportAuthor: this.plugin.settings.exportAuthor || '',
            exportVersion: this.plugin.manifest.version || '',
        };
    }

    /**
     * Runs the preview/selection flow, including the "back to preview" retry
     * after a cancelled note selection.
     * @returns The chosen notes, or null when the user cancels at any point
     */
    private async chooseNotes(collectedNotes: NoteInfo[], metrics: ExportMetrics): Promise<NoteInfo[] | null> {
        const previewModal = new ExportPreviewModal(this.app, metrics, collectedNotes);
        const selectionModal = new NoteSelectionModal(this.app, collectedNotes);

        let preview = await previewModal.openAndAwait();
        if (preview.action === 'cancel') return null;
        if (preview.action === 'exportAll') return collectedNotes;

        const selection = await selectionModal.openAndAwait();
        if (selection) return selection;

        // Selection cancelled: fall back to the preview once more.
        preview = await previewModal.openAndAwait();
        if (preview.action === 'cancel') return null;
        if (preview.action === 'exportAll') return collectedNotes;
        return await selectionModal.openAndAwait();
    }

    /** Compresses, downloads and (optionally) reports the finished export. */
    private deliverExport(file: TFile, htmlContent: string, ledger: ExportSizeLedger): void {
        const containerTitle = this.plugin.settings.wikiTitle || file.basename;
        const { html: outputHtml, meta } = wrapHtmlForExportWithMeta(
            htmlContent,
            this.resolveCompression(file),
            containerTitle
        );
        ledger.applyCompression(meta);

        const filename = this.generateWikiFilename(file.path);
        downloadBlob(new Blob([outputHtml], { type: 'text/html' }), filename);
        new Notice(`Wiki exported as ${filename}`);

        if (this.plugin.settings.showExportStatistics) {
            new ExportStatisticsModal(this.app, ledger.finalize()).open();
        }
    }

    /** Resolves the compression mode from frontmatter and plugin settings. */
    private resolveCompression(file: TFile): CompressionMode {
        const frontmatterExport = this.app.metadataCache.getFileCache(file)?.frontmatter?.export as
            { compression?: unknown } | undefined;
        return resolveCompressionMode(
            frontmatterExport?.compression,
            this.plugin.settings.exportCompression
        );
    }

    private async performRendering(
        orchestrator: WikiExportOrchestrator,
        selectedNotes: NoteInfo[],
        options: WikiRenderOptions,
        token: CancellationToken,
        pauseController: PauseController,
        progressModal: RenderingProgressModal,
        ledger: ExportSizeLedger
    ): Promise<{ renderedPages: Map<string, string>; renderer: DetailedWikiRenderer }> {
        // Create detailed renderer
        const detailedRenderer = new DetailedWikiRenderer(this.app, this.plugin, options);
        detailedRenderer.setSizeLedger(ledger);

        // Only resolve links to pages that will actually be in the export
        detailedRenderer.setResolvablePages(
            selectedNotes.map(n => ({ slug: n.slug, title: n.title, path: n.path }))
        );

        // Start rendering with progress tracking
        const renderedPages = await orchestrator.renderNotesWithProgress(
            detailedRenderer,
            token,
            pauseController,
            (event) => progressModal.handleEvent(event)
        );

        return { renderedPages, renderer: detailedRenderer };
    }

    private generateWikiFilename(filePath: string): string {
        const baseName = filePath.split('/').pop()?.split('.')[0] || 'wiki';
        const sanitized = sanitizeFilename(baseName);
        return `${sanitized}-wiki.html`;
    }
}

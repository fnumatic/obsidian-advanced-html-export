import { App, Notice, TFile } from 'obsidian';
import type AdvancedHtmlExportPlugin from '../main';
import { WikiRenderOptions } from '../utils/wikiHtmlRenderer';
import { WikiExportOrchestrator, NoteInfo } from '../utils/wikiExportOrchestrator';
import { ExportPreviewModal } from '../ui/modals/ExportPreviewModal';
import { NoteSelectionModal } from '../ui/modals/NoteSelectionModal';
import { RenderingProgressModal } from '../ui/modals/RenderingProgressModal';
import { downloadBlob, sanitizeFilename } from '../utils/fileUtils';
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
            // Phase 1: Collect notes (fast - just metadata)
            const options: WikiRenderOptions = {
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

            const orchestrator = new WikiExportOrchestrator(this.app, this.plugin, options);
            
            // Collect notes (this is fast)
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

            // Phase 2: Show preview modal and let user decide
            const previewModal = new ExportPreviewModal(this.app, metrics, collectedNotes);
            const previewResult = await previewModal.openAndAwait();

            if (previewResult.action === 'cancel') {
                new Notice('Export cancelled.');
                return;
            }

            let selectedNotes: NoteInfo[];

            if (previewResult.action === 'selectNotes') {
                // Phase 3: Show note selection modal
                const selectionModal = new NoteSelectionModal(this.app, collectedNotes);
                const selectionResult = await selectionModal.openAndAwait();

                if (selectionResult) {
                    selectedNotes = selectionResult;
                } else {
                    // User clicked "Cancel" → Back to Preview
                    const retryResult = await previewModal.openAndAwait();

                    if (retryResult.action === 'cancel') {
                        new Notice('Export cancelled.');
                        return;
                    }

                    if (retryResult.action === 'exportAll') {
                        selectedNotes = collectedNotes;
                    } else {
                        // retryResult.action === 'selectNotes' - user wants to select again
                        const finalSelection = await selectionModal.openAndAwait();
                        if (!finalSelection) {
                            new Notice('Export cancelled.');
                            return;
                        }
                        selectedNotes = finalSelection;
                    }
                }
            } else {
                // Export all notes
                selectedNotes = collectedNotes;
            }

            // Set selected notes in orchestrator
            orchestrator.setSelectedNotes(selectedNotes);

            // Phase 4: Render selected notes with detailed progress
            const token = new CancellationToken();
            const pauseController = new PauseController();
            const progressModal = new RenderingProgressModal(this.app, token, pauseController, metrics, selectedNotes);
            
            // Open progress modal and start rendering
            const renderPromise = this.performRendering(orchestrator, selectedNotes, options, token, pauseController, progressModal);
            const modalResult = await progressModal.openAndAwait();
            
            if (!modalResult) {
                // User cancelled
                new Notice('Export cancelled by user.');
                return;
            }

            const { renderedPages, renderer: detailedRenderer } = await renderPromise;

            // Generate final HTML using the same renderer that processed the images
            // This ensures the imageCache is available for the restoration script
            const htmlContent = detailedRenderer.generateWikiHtmlWithRenderedPages(
                file,
                renderedPages,
                selectedNotes.map(n => ({ slug: n.slug, title: n.title, path: n.path }))
            );

            // Download
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const filename = this.generateWikiFilename(file.path);

            downloadBlob(blob, filename);

            new Notice(`Wiki exported as ${filename}`);

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

    private async performRendering(
        orchestrator: WikiExportOrchestrator,
        _selectedNotes: NoteInfo[],
        options: WikiRenderOptions,
        token: CancellationToken,
        pauseController: PauseController,
        progressModal: RenderingProgressModal
    ): Promise<{ renderedPages: Map<string, string>; renderer: DetailedWikiRenderer }> {
        // Create detailed renderer
        const detailedRenderer = new DetailedWikiRenderer(this.app, this.plugin, options);
        
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

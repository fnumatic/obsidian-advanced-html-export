// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import type AdvancedHtmlExportPlugin from '../main';
import type { ExportMetrics, NoteInfo } from '../utils/wikiExportOrchestrator';
import { ExportWikiCommand } from './exportWiki';
import { DEFAULT_SETTINGS } from '../settings';
import { WikiExportOrchestrator } from '../utils/wikiExportOrchestrator';
import { ExportPreviewModal } from '../ui/modals/ExportPreviewModal';
import { RenderingProgressModal } from '../ui/modals/RenderingProgressModal';
import { NoteSelectionModal } from '../ui/modals/NoteSelectionModal';
import { CancellationError } from '../utils/cancellationToken';
import type { DetailedWikiRenderer } from '../utils/detailedRenderer';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('wiki rendering promise ownership', () => {
  it.each([false, true])('observes render failures when the modal result is %s', async rendered => {
    const file = new TFile();
    const note: NoteInfo = {
      file, path: 'note.md', title: 'Note', slug: 'note', depth: 0, frontmatter: {},
      estimatedDiagrams: 0, codeBlockCount: 0, linkCount: 0,
    };
    const metrics: ExportMetrics = {
      totalNotes: 1, estimatedDiagrams: 0, totalCodeBlocks: 0, estimatedTimeMinutes: 1, notesByDepth: new Map([[0, 1]]),
    };
    vi.spyOn(WikiExportOrchestrator.prototype, 'collectNotes').mockResolvedValue([note]);
    vi.spyOn(WikiExportOrchestrator.prototype, 'getMetrics').mockReturnValue(metrics);
    vi.spyOn(WikiExportOrchestrator.prototype, 'setSelectedNotes').mockImplementation(() => {});
    vi.spyOn(ExportPreviewModal.prototype, 'openAndAwait').mockResolvedValue({ action: 'exportAll' });
    vi.spyOn(RenderingProgressModal.prototype, 'openAndAwait').mockResolvedValue(rendered);
    const error = rendered ? new Error('Renderer failed') : new CancellationError();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = new App();
    app.vault.getFiles = () => [];
    const command = new ExportWikiCommand(app, {
      settings: DEFAULT_SETTINGS, manifest: { version: 'test' },
    } as AdvancedHtmlExportPlugin);
    const render = vi.spyOn(command as unknown as { performRendering(): Promise<never> }, 'performRendering')
      .mockRejectedValue(error);
    await command.executeWithFile(file);
    // Both renderer failures and cancellation settle without an unhandled rejection.
    expect(render).toHaveBeenCalledOnce();
    if (rendered) expect(consoleError).toHaveBeenCalledWith('Error exporting wiki:', error);
    else expect(consoleError).not.toHaveBeenCalled();
  });

  it.each([false, true])('delivers a subset export when a selected note fails: %s', async fails => {
    vi.useFakeTimers();
    const file = new TFile();
    const note: NoteInfo = {
      file, path: 'note.md', title: 'Note', slug: 'note', depth: 0, frontmatter: {},
      estimatedDiagrams: 0, codeBlockCount: 0, linkCount: 0,
    };
    const metrics: ExportMetrics = {
      totalNotes: 53, estimatedDiagrams: 0, totalCodeBlocks: 0, estimatedTimeMinutes: 1, notesByDepth: new Map([[0, 53]]),
    };
    vi.spyOn(WikiExportOrchestrator.prototype, 'collectNotes').mockResolvedValue([note]);
    const getMetrics = vi.spyOn(WikiExportOrchestrator.prototype, 'getMetrics')
      .mockReturnValueOnce(metrics).mockReturnValue({ ...metrics, totalNotes: 1 });
    vi.spyOn(WikiExportOrchestrator.prototype, 'setSelectedNotes').mockImplementation(() => {});
    vi.spyOn(ExportPreviewModal.prototype, 'openAndAwait').mockResolvedValue({ action: 'selectNotes' });
    vi.spyOn(NoteSelectionModal.prototype, 'openAndAwait').mockResolvedValue([note]);
    const app = new App();
    app.vault.getFiles = () => [];
    const command = new ExportWikiCommand(app, {
      settings: DEFAULT_SETTINGS, manifest: { version: 'test' },
    } as AdvancedHtmlExportPlugin);
    type RenderResult = { renderedPages: Map<string, string>; renderer: DetailedWikiRenderer };
    const render = vi.spyOn(command as unknown as { performRendering(...args: unknown[]): Promise<RenderResult> }, 'performRendering')
      .mockImplementation(async (...args: unknown[]): Promise<RenderResult> => {
        const modal = args[5] as RenderingProgressModal;
        expect(modal.contentEl.querySelector('[data-tags="rp-container"]')).not.toBeNull();
        modal.handleEvent({ type: 'note_start', timestamp: 1, noteTitle: 'Note' });
        expect(modal.contentEl.textContent).toContain('Rendering 1/1');
        modal.handleEvent({ type: fails ? 'note_error' : 'note_complete', timestamp: 2 });
        return {
          renderedPages: new Map([['note', '<p>Note</p>']]),
          renderer: { generateWikiHtmlWithRenderedPages: () => '<html>Export</html>' } as unknown as DetailedWikiRenderer,
        };
      });
    const deliver = vi.spyOn(command as unknown as { deliverExport(): void }, 'deliverExport').mockImplementation(() => {});
    const task = command.executeWithFile(file);
    await vi.advanceTimersByTimeAsync(0);
    expect(render).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    await task;
    expect(getMetrics).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

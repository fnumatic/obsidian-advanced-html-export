// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import type { ExportMetrics, NoteInfo } from '../utils/wikiExportOrchestrator';
import type { ExportSizeReport } from '../utils/exportSizeReport';
import type { ModalView } from './view';
import { CancellationToken } from '../utils/cancellationToken';
import { PauseController } from '../utils/pauseController';
import { createNoteSelectionView } from './views/note-selection-view';
import { createExportPreviewView } from './views/export-preview-view';
import { createExportStatisticsView } from './views/export-statistics-view';
import { createRenderingProgressView } from './views/rendering-progress-view';
import { element } from './view-helpers';
import { NoteSelectionModal } from './modals/NoteSelectionModal';
import { ExportPreviewModal } from './modals/ExportPreviewModal';
import { ExportStatisticsModal } from './modals/ExportStatisticsModal';
import { RenderingProgressModal } from './modals/RenderingProgressModal';

const notes: NoteInfo[] = [0, 1, 2].map(index => ({
  file: new TFile(), slug: `note-${index}`, title: `Note ${index} <safe>`, path: `folder/note-${index}.md`,
  depth: 0, estimatedDiagrams: index, codeBlockCount: index, linkCount: index, frontmatter: {},
}));
const metrics: ExportMetrics = {
  totalNotes: 3, estimatedDiagrams: 3, totalCodeBlocks: 3, estimatedTimeMinutes: 1, notesByDepth: new Map([[0, 3]]),
};
const report: ExportSizeReport = {
  rawBytes: 2048, outputBytes: 1024, categories: [{ key: 'images', bytes: 2048, share: 1 }],
  imageFormats: [{ format: 'webp', count: 1, bytes: 2048 }], vaultNoteBytes: 1024,
  vaultImageBytes: 2048, vaultOriginalBytes: 3072, embeddedImageBytes: 2048,
  imageReferences: 2, uniqueImages: 1, deduplicationSavingBytes: 2048, noteCount: 3,
  largestArtifacts: [{ kind: 'image', original: '"><img src=x onerror=alert(1)>', exportType: '<svg>', bytes: 2048 }],
};

let target: HTMLElement;
let view: ModalView | undefined;
const click = (name: string, root: HTMLElement = target): void => element<HTMLButtonElement>(root, `[data-action="${name}"]`).click();
const search = (value: string): void => {
  const input = element<HTMLInputElement>(target, '[data-tags="ns-search"] input');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
  vi.useFakeTimers();
  target = document.createElement('div');
  document.body.append(target);
});
afterEach(() => {
  view?.dispose();
  view = undefined;
  target.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('native views', () => {
  it('sorts notes, selects all initially, and escapes user text', () => {
    view = createNoteSelectionView(target, { notes, onConfirm: vi.fn(), onCancel: vi.fn() });
    expect(target.querySelectorAll('input:checked')).toHaveLength(3);
    expect(element(target, '.note-list-item').textContent).toContain('Note 2');
    expect(target.querySelector('safe')).toBeNull();
    expect(element(target, '[data-count]').textContent).toBe('3/3 selected');
  });

  it('reuses filtered rows and preserves hidden selections in original order', () => {
    const confirm = vi.fn();
    view = createNoteSelectionView(target, { notes, onConfirm: confirm, onCancel: vi.fn() });
    const firstRow = element(target, '.note-list-item');
    click('diagrams');
    search('note-1.md');
    expect(target.querySelectorAll('.note-list-item')).toHaveLength(1);
    click('export');
    expect(confirm).toHaveBeenLastCalledWith([notes[1], notes[2]]);
    search('');
    expect(element(target, '.note-list-item')).toBe(firstRow);
    expect(target.querySelectorAll('input:checked')).toHaveLength(2);
  });

  it('supports label clicks and Enter, blocks empty export, and cleans warning timers and listeners', () => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    view = createNoteSelectionView(target, { notes, onConfirm: confirm, onCancel: cancel });
    const checkbox = element<HTMLInputElement>(target, '.note-list-item input');
    element<HTMLLabelElement>(target, '.note-list-item').click();
    expect(checkbox.checked).toBe(false);
    checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(checkbox.checked).toBe(true);
    click('none');
    click('export');
    expect(confirm).not.toHaveBeenCalled();
    expect(element(target, '[data-tags="ns-warning"]').hidden).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(element(target, '[data-tags="ns-warning"]').hidden).toBe(true);
    click('all');
    click('export');
    expect(confirm).toHaveBeenCalledWith(notes);
    click('none');
    click('export');
    view.dispose();
    expect(vi.getTimerCount()).toBe(0);
    click('cancel');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('routes every preview action and handles an empty preview', () => {
    const action = vi.fn();
    view = createExportPreviewView(target, { notes, metrics, onAction: action });
    expect(target.querySelectorAll('.note-list-item')).toHaveLength(3);
    expect(target.querySelector('safe')).toBeNull();
    for (const name of ['cancel', 'selectNotes', 'exportAll']) {
      click(name);
      expect(action).toHaveBeenLastCalledWith(name);
    }
    view.dispose();
    click('exportAll');
    expect(action).toHaveBeenCalledTimes(3);
    view = createExportPreviewView(target, { notes: [], metrics, onAction: action });
    expect(target.querySelector('[data-tags="ep-notes"]')).toBeNull();
  });

  it.each([undefined, 'none', 'gzipb64', 'gzipb85'] as const)('renders statistics and compression mode %s without injecting markup', mode => {
    const close = vi.fn();
    view = createExportStatisticsView(target, { report: { ...report, compression: mode ? {
      mode, rawBytes: 2048, compressedBytes: 512, encodedBytes: 600, outputBytes: 1024, encodingOverheadBytes: 88,
    } : undefined }, onClose: close });
    expect(element(target, '[data-tags="es-output"]').textContent).toBe('1.0 KB');
    expect(element(target, '[data-tags="es-artifact-original"]').textContent).toBe(report.largestArtifacts[0].original);
    expect(target.querySelector('img, svg')).toBeNull();
    expect(target.textContent?.includes('gzip payload')).toBe(mode === 'gzipb64' || mode === 'gzipb85');
    expect(target.textContent).toContain('100.0%');
    click('close');
    expect(close).toHaveBeenCalledOnce();
  });

  it('omits empty statistics sections and shows compression growth', () => {
    view = createExportStatisticsView(target, { report: {
      ...report, rawBytes: 0, outputBytes: 1024, imageFormats: [], largestArtifacts: [], deduplicationSavingBytes: 0,
      compression: { mode: 'gzipb64', rawBytes: 0, compressedBytes: 512, encodedBytes: 600, outputBytes: 1024, encodingOverheadBytes: 88 },
    }, onClose: vi.fn() });
    expect(target.querySelector('[data-tags="es-artifacts"], [data-tags="es-formats"]')).toBeNull();
    expect(target.textContent).toContain('+1.0 KB');
    expect(target.innerHTML).not.toContain('NaN');
    expect(target.textContent).not.toContain('Saved by deduplication');
  });

  it('updates progress, phases and timers without rebuilding completed rows', () => {
    const token = new CancellationToken();
    const pauseController = new PauseController();
    const progress = createRenderingProgressView(target, { metrics, token, pauseController, onComplete: vi.fn(), onCancel: vi.fn() });
    view = progress;
    progress.handleEvent({ type: 'note_start', timestamp: 1, noteTitle: '<img>', details: { totalImages: 1 } });
    progress.handleEvent({ type: 'image_start', timestamp: 2, details: { total: 1, fileName: '<safe>' } });
    progress.handleEvent({ type: 'image_phase', timestamp: 3, details: { phase: 'hashing' } });
    expect(target.textContent).toContain('Hashing: <safe>');
    expect(target.querySelector('img, safe')).toBeNull();
    progress.handleEvent({ type: 'note_complete', timestamp: 4, details: { duration: 100 } });
    const completed = element(target, '[data-completed-list] .note-list-item');
    vi.advanceTimersByTime(1000);
    expect(target.textContent).toContain('0:01');
    expect(element(target, '[data-completed-list] .note-list-item')).toBe(completed);
    expect(element(target, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe('33');
    click('pause');
    expect(pauseController.isPaused).toBe(true);
    click('cancel');
    expect(token.isCancelled).toBe(true);
    expect(pauseController.isPaused).toBe(false);
    progress.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('modal lifecycle', () => {
  it('resolves preview choices and supports reopening the same modal', async () => {
    const modal = new ExportPreviewModal(new App(), metrics, notes);
    const first = modal.openAndAwait();
    click('selectNotes', modal.contentEl);
    await expect(first).resolves.toEqual({ action: 'selectNotes' });
    expect(modal.contentEl.children).toHaveLength(0);
    const second = modal.openAndAwait();
    modal.close();
    await expect(second).resolves.toEqual({ action: 'cancel' });
  });

  it('resolves selection and treats external close as cancellation', async () => {
    const modal = new NoteSelectionModal(new App(), notes);
    const first = modal.openAndAwait();
    click('export', modal.contentEl);
    await expect(first).resolves.toEqual(notes);
    const second = modal.openAndAwait();
    modal.close();
    await expect(second).resolves.toBeNull();
  });

  it('cancels and resumes a paused render when the progress modal closes externally', async () => {
    const token = new CancellationToken();
    const pauseController = new PauseController();
    const modal = new RenderingProgressModal(new App(), token, pauseController, metrics);
    const result = modal.openAndAwait();
    click('pause', modal.contentEl);
    modal.close();
    await expect(result).resolves.toBe(false);
    expect(token.isCancelled).toBe(true);
    expect(pauseController.isPaused).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    modal.handleEvent({ type: 'note_start', timestamp: 1 });
    expect(modal.contentEl.children).toHaveLength(0);
  });

  it('resolves completed rendering once, without cancelling the token', async () => {
    const token = new CancellationToken();
    const modal = new RenderingProgressModal(new App(), token, new PauseController(), { ...metrics, totalNotes: 1 });
    const result = modal.openAndAwait();
    modal.handleEvent({ type: 'note_start', timestamp: 1 });
    modal.handleEvent({ type: 'note_complete', timestamp: 2 });
    modal.complete();
    vi.advanceTimersByTime(1000);
    await expect(result).resolves.toBe(true);
    expect(token.isCancelled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears warning timers on external selection close and resolves void statistics', async () => {
    const selection = new NoteSelectionModal(new App(), notes);
    const selected = selection.openAndAwait();
    click('none', selection.contentEl);
    click('export', selection.contentEl);
    selection.close();
    await expect(selected).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    const statistics = new ExportStatisticsModal(new App(), report);
    const closed = statistics.openAndAwait();
    click('close', statistics.contentEl);
    await expect(closed).resolves.toBeUndefined();
  });
});

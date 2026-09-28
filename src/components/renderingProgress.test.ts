import { describe, it, expect, vi } from 'vitest';
import { RenderingProgressStore, type RenderingProgressDeps } from './renderingProgress.svelte';
import type { ExportMetrics } from '../utils/wikiExportOrchestrator';
import type { CancellationToken } from '../utils/cancellationToken';
import type { PauseController } from '../utils/pauseController';
import type { RenderEvent } from '../utils/detailedRenderer';

function makeDeps(): RenderingProgressDeps {
  const metrics: ExportMetrics = {
    totalNotes: 2,
    estimatedDiagrams: 0,
    totalCodeBlocks: 0,
    estimatedTimeMinutes: 1,
    notesByDepth: new Map([[0, 2]]),
  };
  return {
    metrics,
    token: { cancel: vi.fn(), throwIfCancelled: vi.fn() } as unknown as CancellationToken,
    pauseController: { pause: vi.fn(), resume: vi.fn(), waitIfPaused: vi.fn() } as unknown as PauseController,
    onComplete: vi.fn(),
    onCancel: vi.fn(),
  };
}

const noteStart = (): RenderEvent => ({
  type: 'note_start',
  timestamp: 1,
  noteTitle: 'Note',
  notePath: 'note.md',
  details: { totalDiagrams: 2, totalCodeBlocks: 1, totalImages: 0 },
});

const noteComplete = (): RenderEvent => ({
  type: 'note_complete',
  timestamp: 2,
  details: { duration: 10 },
});

describe('RenderingProgressStore', () => {
  it('tracks the current note and advances sub-progress', () => {
    const store = new RenderingProgressStore(makeDeps());

    store.handleEvent(noteStart());
    expect(store.currentNote?.diagrams.total).toBe(2);

    store.handleEvent({ type: 'diagram_complete', timestamp: 3 });
    store.handleEvent({ type: 'diagram_complete', timestamp: 4 });
    expect(store.currentNote?.diagrams.processed).toBe(2);
  });

  it('moves notes to the completed list and finishes after the last one', () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const store = new RenderingProgressStore(deps);

    store.handleEvent(noteStart());
    store.handleEvent(noteComplete());
    expect(store.completedNotes).toHaveLength(1);
    expect(store.isCompleted).toBe(false);

    store.handleEvent(noteStart());
    store.handleEvent(noteComplete());
    expect(store.completedNotes).toHaveLength(2);
    expect(store.isCompleted).toBe(true);

    vi.runAllTimers();
    expect(deps.onComplete).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('computes overall progress from the completed notes', () => {
    const store = new RenderingProgressStore(makeDeps());
    expect(store.overallProgress).toBe(0);

    store.handleEvent(noteStart());
    store.handleEvent(noteComplete());
    expect(store.overallProgress).toBe(50);
  });

  it('toggles pause on the controller', () => {
    const deps = makeDeps();
    const store = new RenderingProgressStore(deps);

    store.togglePause();
    expect(deps.pauseController.pause).toHaveBeenCalledOnce();
    expect(store.isPaused).toBe(true);

    store.togglePause();
    expect(deps.pauseController.resume).toHaveBeenCalledOnce();
    expect(store.isPaused).toBe(false);
  });

  it('cancels via the token and notifies after a grace period', () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const store = new RenderingProgressStore(deps);

    store.cancel();
    expect(deps.token.cancel).toHaveBeenCalledOnce();
    expect(store.isCancelled).toBe(true);

    vi.advanceTimersByTime(500);
    expect(deps.onCancel).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('ignores events after cancellation', () => {
    const store = new RenderingProgressStore(makeDeps());
    store.handleEvent(noteStart());
    store.cancel();
    store.handleEvent({ type: 'diagram_complete', timestamp: 3 });
    expect(store.currentNote?.diagrams.processed).toBe(0);
  });
});

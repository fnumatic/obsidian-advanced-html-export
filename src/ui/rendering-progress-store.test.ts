import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { RenderingProgressStore } from './rendering-progress-store';
import type { RenderingProgressProps } from './types';
import type { ExportMetrics } from '../utils/wikiExportOrchestrator';
import type { CancellationToken } from '../utils/cancellationToken';
import type { PauseController } from '../utils/pauseController';
import type { RenderEvent } from '../utils/detailedRenderer';

function makeDeps(): RenderingProgressProps {
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
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  it('tracks the current note and advances sub-progress', () => {
    const store = new RenderingProgressStore(makeDeps());

    store.handleEvent(noteStart());
    expect(store.currentNote?.diagrams.total).toBe(2);

    store.handleEvent({ type: 'diagram_complete', timestamp: 3 });
    store.handleEvent({ type: 'diagram_complete', timestamp: 4 });
    expect(store.currentNote?.diagrams.processed).toBe(2);
  });

  it('moves notes to the completed list but waits for renderer completion', () => {
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
    expect(store.isCompleted).toBe(false);
    expect(deps.onComplete).not.toHaveBeenCalled();
    store.complete();
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

  it('notifies the view for events, elapsed time and warning expiry', () => {
    const changed = vi.fn();
    const store = new RenderingProgressStore(makeDeps(), changed);
    store.start();
    store.start();
    expect(vi.getTimerCount()).toBe(1);
    store.handleEvent(noteStart());
    expect(changed).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(store.elapsedLabel).toBe('0:01');
    expect(changed).toHaveBeenCalledTimes(2);
    store.handleEvent({ type: 'note_error', timestamp: 3, noteTitle: 'Broken', details: { error: 'failed' } });
    expect(store.warning).toContain('Broken');
    vi.advanceTimersByTime(5000);
    expect(store.warning).toBeNull();
    store.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['complete', 'cancel'] as const)('clears pending %s callbacks and all timers on disposal', result => {
    const deps = makeDeps();
    deps.metrics.totalNotes = 1;
    const changed = vi.fn();
    const store = new RenderingProgressStore(deps, changed);
    store.start();
    store.handleEvent(noteStart());
    store.handleEvent({ type: 'note_error', timestamp: 3, details: { error: 'failed' } });
    if (result === 'complete') { store.handleEvent(noteComplete()); store.complete(); }
    else store.cancel();
    store.dispose();
    const calls = changed.mock.calls.length;
    expect(vi.getTimerCount()).toBe(0);
    store.start();
    store.handleEvent(noteStart());
    store.togglePause();
    store.cancel();
    vi.runAllTimers();
    expect(changed).toHaveBeenCalledTimes(calls);
    expect(deps.onComplete).not.toHaveBeenCalled();
    expect(deps.onCancel).not.toHaveBeenCalled();
  });

  it('cancels only once and resumes a paused renderer', () => {
    const deps = makeDeps();
    const store = new RenderingProgressStore(deps);
    store.togglePause();
    store.cancel();
    store.cancel();
    expect(store.isPaused).toBe(false);
    expect(deps.pauseController.resume).toHaveBeenCalledOnce();
    expect(deps.token.cancel).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(500);
    expect(deps.onCancel).toHaveBeenCalledOnce();
  });

  it('ignores late events after completion', () => {
    const deps = makeDeps();
    deps.metrics.totalNotes = 1;
    const store = new RenderingProgressStore(deps);
    store.handleEvent(noteStart());
    store.handleEvent(noteComplete());
    store.complete();
    store.handleEvent(noteStart());
    store.cancel();
    expect(store.completedNotes).toHaveLength(1);
    expect(store.currentNote).toBeNull();
    expect(store.overallProgress).toBe(100);
    vi.advanceTimersByTime(1000);
    expect(deps.onComplete).toHaveBeenCalledOnce();
    expect(deps.onCancel).not.toHaveBeenCalled();
  });

  it('can finish after failed notes without waiting for missing note_complete events', () => {
    const deps = makeDeps();
    const store = new RenderingProgressStore(deps);
    store.handleEvent(noteStart());
    store.handleEvent({ type: 'note_error', timestamp: 3, details: { error: 'failed' } });
    store.complete();
    store.complete();
    expect(store.completedNotes).toHaveLength(0);
    expect(store.overallProgress).toBe(100);
    vi.advanceTimersByTime(1000);
    expect(deps.onComplete).toHaveBeenCalledOnce();
  });
});

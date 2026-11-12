import { describe, expect, it } from 'vitest';
import {
  applyProgressEvent,
  cancelProgress,
  completeProgress,
  createProgressState,
  noteElapsed,
  overallProgress,
  tickProgress,
  togglePause,
} from './progress-core';
import type { RenderEvent } from '../utils/detailedRenderer';

const noteStart: RenderEvent = {
  type: 'note_start', timestamp: 1, noteTitle: 'Note', notePath: 'note.md',
  details: { totalDiagrams: 2, totalCodeBlocks: 1, totalImages: 1 },
};
const complete: RenderEvent = { type: 'note_complete', timestamp: 2, details: { duration: 100 } };

function withNote() {
  return applyProgressEvent(createProgressState(0), noteStart, 2).state;
}

describe('progress core', () => {
  it('tracks the current note, its phase and the completed list', () => {
    let state = withNote();
    expect(state.currentNote?.diagrams.total).toBe(2);
    expect(state.currentNote?.phase).toBe('Rendering Markdown');

    state = applyProgressEvent(state, { type: 'note_phase', timestamp: 2, details: { phase: 'Processing images' } }, 2).state;
    expect(state.currentNote?.phase).toBe('Processing images');

    state = applyProgressEvent(state, { type: 'diagram_complete', timestamp: 3 }, 2).state;
    expect(state.currentNote?.diagrams.processed).toBe(1);

    state = applyProgressEvent(state, complete, 2).state;
    expect(state.completedNotes).toHaveLength(1);
    expect(state.currentNote).toBeNull();
    expect(state.isCompleted).toBe(false);
  });

  it('finishes only when the command confirms it, even with failed notes', () => {
    const started = withNote();
    const failed = applyProgressEvent(started, { type: 'note_error', timestamp: 2, details: { error: 'x' } }, 1).state;
    expect(failed.isCompleted).toBe(false);
    const done = completeProgress(failed);
    expect(done.isCompleted).toBe(true);
    expect(overallProgress(done, 1)).toBe(100);
  });

  it('maps pause and cancel to effects and never cancels twice', () => {
    const paused = togglePause(withNote());
    expect(paused.effect).toEqual({ kind: 'pause' });
    const resumed = togglePause(paused.state);
    expect(resumed.effect).toEqual({ kind: 'resume' });

    const cancelled = cancelProgress(resumed.state);
    expect(cancelled.effect).toEqual({ kind: 'cancel' });
    expect(cancelled.state.isCancelled).toBe(true);
    expect(cancelProgress(cancelled.state).effect).toEqual({ kind: 'none' });
  });

  it('ignores late events and keeps progress at 100 after completion', () => {
    const done = completeProgress(withNote());
    const late = applyProgressEvent(done, noteStart, 1).state;
    expect(late).toBe(done);
    expect(overallProgress(done, 1)).toBe(100);
  });

  it('derives elapsed time, remaining notes and speed from one clock', () => {
    let state = withNote();
    state = applyProgressEvent(state, complete, 2).state;
    state = applyProgressEvent(state, noteStart, 2).state;
    const ticked = tickProgress(state, 120000, 2);
    expect(ticked.elapsedTime).toBe(120000);
    expect(ticked.remainingTime).toBe(120000);
    expect(ticked.speed).toBe('0.5 notes/min');
    expect(tickProgress(createProgressState(0), 5000, 1).elapsedTime).toBe(5000);
  });

  it('reports per-note elapsed time from the note start', () => {
    const state = withNote();
    expect(noteElapsed(state, state.currentNote!.startedAt! + 2500)).toBe(2500);
    expect(noteElapsed(createProgressState(0), 2500)).toBe(0);
  });

  it('computes weighted progress from completed and in-flight notes', () => {
    const state = applyProgressEvent(withNote(), complete, 2).state;
    expect(overallProgress(state, 2)).toBe(50);
    expect(overallProgress(state, 0)).toBe(0);
    const halfway = { ...withNote() };
    halfway.currentNote = {
      ...halfway.currentNote!,
      diagrams: { total: 1, processed: 1 },
      codeBlocks: { total: 1, processed: 1 },
      images: { total: 1, processed: 1 },
    };
    expect(overallProgress(halfway, 1)).toBe(100);
  });
});

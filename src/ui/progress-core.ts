/**
 * Pure progress transitions for the rendering view.
 *
 * Every function here is side-effect free: it takes the previous state and the
 * data it needs, and returns the next state. Timers, cancellation callbacks and
 * DOM updates stay in the store that owns them.
 */

import type { RenderEvent } from '../utils/detailedRenderer';
import type { CompletedNote, CurrentNoteProgress, DetailItem, DetailKey } from './types';
import {
  calculateCurrentNoteProgress,
  completedNoteFrom,
  currentNoteFromEvent,
  numberDetail,
  updateNotePhase,
  updateNoteProgress,
  warningMessage,
} from '../utils/renderProgress';

export interface ProgressState {
  completedNotes: CompletedNote[];
  currentNote: CurrentNoteProgress | null;
  isPaused: boolean;
  isCancelled: boolean;
  isCompleted: boolean;
  elapsedTime: number;
  remainingTime: number | null;
  speed: string;
  warning: string | null;
  startedAt: number;
}

/** What a state transition asks the owning store to do. */
export type ProgressEffect =
  | { kind: 'none' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'cancel' };

export function createProgressState(now: number = Date.now()): ProgressState {
  return {
    completedNotes: [],
    currentNote: null,
    isPaused: false,
    isCancelled: false,
    isCompleted: false,
    elapsedTime: 0,
    remainingTime: null,
    speed: 'Starting...',
    warning: null,
    startedAt: now,
  };
}

/** Advances the elapsed clock and the derived speed/remaining estimates. */
export function tickProgress(state: ProgressState, now: number, totalNotes: number): ProgressState {
  if (state.isCancelled || state.isCompleted) return state;
  const elapsedTime = now - state.startedAt;
  const completed = state.completedNotes.length;
  if (completed === 0) return { ...state, elapsedTime };
  const remainingNotes = totalNotes - completed;
  return {
    ...state,
    elapsedTime,
    remainingTime: (elapsedTime / completed) * remainingNotes,
    speed: `${(completed / (elapsedTime / 60000)).toFixed(1)} notes/min`,
  };
}

/** Applies one renderer event. Events after completion or cancellation are ignored. */
export function applyProgressEvent(
  state: ProgressState,
  event: RenderEvent,
  totalNotes: number,
): { state: ProgressState; effect: ProgressEffect } {
  if (state.isCancelled || state.isCompleted) return { state, effect: { kind: 'none' } };

  switch (event.type) {
    case 'note_start':
      return {
        state: { ...state, currentNote: currentNoteFromEvent(event, state.completedNotes.length, totalNotes) },
        effect: { kind: 'none' },
      };
    case 'note_complete': {
      if (!state.currentNote) return { state, effect: { kind: 'none' } };
      // Completion is confirmed by the export command, not by counting events:
      // failed notes never emit note_complete.
      return {
        state: {
          ...state,
          completedNotes: [...state.completedNotes, completedNoteFrom(state.currentNote, event)],
          currentNote: null,
        },
        effect: { kind: 'none' },
      };
    }
    case 'note_error':
      return {
        state: { ...state, warning: `Error rendering ${event.noteTitle}: ${event.details?.error}` },
        effect: { kind: 'none' },
      };
    case 'note_phase':
      return state.currentNote && typeof event.details?.phase === 'string'
        ? { state: { ...state, currentNote: updateNotePhase(state.currentNote, event.details.phase) }, effect: { kind: 'none' } }
        : { state, effect: { kind: 'none' } };
    case 'warning_slow_operation': {
      const message = warningMessage(event);
      return message
        ? { state: { ...state, warning: message }, effect: { kind: 'none' } }
        : { state, effect: { kind: 'none' } };
    }
    default:
      return { state: applyDetailEvent(state, event), effect: { kind: 'none' } };
  }
}

function applyDetailEvent(state: ProgressState, event: RenderEvent): ProgressState {
  if (!state.currentNote) return state;
  switch (event.type) {
    case 'diagram_start':
      return update(state, 'diagrams', { total: numberDetail(event, 'totalDiagrams') });
    case 'diagram_complete':
      return advance(state, 'diagrams');
    case 'codeblock_start':
      return update(state, 'codeBlocks', { total: numberDetail(event, 'totalCodeBlocks') });
    case 'codeblock_complete':
      return advance(state, 'codeBlocks');
    case 'image_start':
      return update(state, 'images', {
        total: numberDetail(event, 'total'),
        currentFileName: typeof event.details?.fileName === 'string' ? event.details.fileName : '',
      });
    case 'image_phase':
      return update(state, 'images', {
        currentPhase: typeof event.details?.phase === 'string' ? event.details.phase : '',
      });
    case 'image_complete':
      return advance(state, 'images');
    default:
      return state;
  }
}

function update(state: ProgressState, type: DetailKey, changes: Partial<DetailItem>): ProgressState {
  if (!state.currentNote) return state;
  return { ...state, currentNote: updateNoteProgress(state.currentNote, type, changes) };
}

function advance(state: ProgressState, type: DetailKey): ProgressState {
  if (!state.currentNote) return state;
  const item = state.currentNote[type];
  return { ...state, currentNote: updateNoteProgress(state.currentNote, type, { processed: item.processed + 1 }) };
}

/** Toggles pause; the caller forwards the effect to the pause controller. */
export function togglePause(state: ProgressState): { state: ProgressState; effect: ProgressEffect } {
  if (state.isCancelled || state.isCompleted) return { state, effect: { kind: 'none' } };
  return { state: { ...state, isPaused: !state.isPaused }, effect: { kind: state.isPaused ? 'resume' : 'pause' } };
}

/** Cancels the export and resumes a paused renderer. */
export function cancelProgress(state: ProgressState): { state: ProgressState; effect: ProgressEffect } {
  if (state.isCancelled || state.isCompleted) return { state, effect: { kind: 'none' } };
  return {
    state: {
      ...state,
      isCancelled: true,
      isPaused: false,
      warning: 'Cancelling... Please wait for current operation to complete.',
    },
    effect: { kind: 'cancel' },
  };
}

/** Finishes only when the export command confirms that rendering has settled. */
export function completeProgress(state: ProgressState): ProgressState {
  if (state.isCancelled || state.isCompleted) return state;
  return { ...state, isCompleted: true, currentNote: null, remainingTime: 0 };
}

/** Weighted overall progress in percent. */
export function overallProgress(state: ProgressState, totalNotes: number): number {
  if (state.isCompleted) return 100;
  if (totalNotes <= 0) return 0;
  const notesProgress = state.completedNotes.length / totalNotes;
  if (!state.currentNote) return Math.round(notesProgress * 100);
  return Math.min(
    100,
    Math.round(notesProgress * 100 + calculateCurrentNoteProgress(state.currentNote) * (100 / totalNotes)),
  );
}

/** Time spent on the note currently being rendered. */
export function noteElapsed(state: ProgressState, now: number): number {
  return state.currentNote?.startedAt ? now - state.currentNote.startedAt : 0;
}

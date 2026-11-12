import type { RenderEvent } from '../utils/detailedRenderer';
import type { CompletedNote, CurrentNoteProgress, RenderingProgressProps } from './types';
import {
  calculateCurrentNoteProgress,
  completedNoteFrom,
  currentNoteFromEvent,
  formatDuration,
  updateNoteProgress,
  updateNotePhase,
  warningMessage,
} from '../utils/renderProgress';

const WARNING_TIMEOUT_MS = 5000;

/**
 * Progress state and timers. The view receives one notification per change.
 */
export class RenderingProgressStore {
  completedNotes: CompletedNote[] = [];
  currentNote: CurrentNoteProgress | null = null;
  isPaused = false;
  isCancelled = false;
  isCompleted = false;
  elapsedTime = 0;
  remainingTime: number | null = null;
  speed = 'Starting...';
  warning: string | null = null;

  get overallProgress(): number {
    if (this.isCompleted) return 100;
    const total = this.deps.metrics.totalNotes;
    if (total <= 0) return 0;

    const notesProgress = this.completedNotes.length / total;
    if (!this.currentNote) {
      return Math.round(notesProgress * 100);
    }
    const currentProgress = calculateCurrentNoteProgress(this.currentNote);
    return Math.min(100, Math.round(notesProgress * 100 + currentProgress * (100 / total)));
  }

  get elapsedLabel(): string {
    return formatDuration(this.elapsedTime);
  }

  get remainingLabel(): string {
    return this.remainingTime !== null ? `~${formatDuration(this.remainingTime)}` : 'Calculating...';
  }

  /** Time spent on the note currently being rendered. */
  get noteElapsed(): number {
    return this.currentNote?.startedAt ? Date.now() - this.currentNote.startedAt : 0;
  }

  private readonly deps: RenderingProgressProps;
  private readonly startTime = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;
  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(deps: RenderingProgressProps, private readonly onChange: () => void = () => {}) {
    this.deps = deps;
  }

  /** Starts the elapsed-time ticker. */
  start(): void {
    if (this.disposed || this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /** Stops all timers. Call when the view unmounts. */
  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.warningTimer !== null) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    if (this.resultTimer !== null) {
      clearTimeout(this.resultTimer);
      this.resultTimer = null;
    }
  }

  private tick(): void {
    if (this.isCancelled || this.isCompleted) return;
    this.elapsedTime = Date.now() - this.startTime;

    if (this.completedNotes.length > 0) {
      const avgTimePerNote = this.elapsedTime / this.completedNotes.length;
      const remainingNotes = this.deps.metrics.totalNotes - this.completedNotes.length;
      this.remainingTime = avgTimePerNote * remainingNotes;
      this.speed = `${(this.completedNotes.length / (this.elapsedTime / 60000)).toFixed(1)} notes/min`;
    }
    this.onChange();
  }

  /** Applies a render event to the progress state. */
  handleEvent(event: RenderEvent): void {
    if (this.disposed || this.isCancelled || this.isCompleted) return;

    switch (event.type) {
      case 'note_start':
        this.currentNote = currentNoteFromEvent(event, this.completedNotes.length, this.deps.metrics.totalNotes);
        break;
      case 'note_complete':
        this.handleNoteComplete(event);
        break;
      case 'note_phase': {
        const phase = typeof event.details?.phase === 'string' ? event.details.phase : '';
        if (this.currentNote && phase) this.currentNote = updateNotePhase(this.currentNote, phase);
        break;
      }
      case 'note_error':
        this.setWarning(`Error rendering ${event.noteTitle}: ${event.details?.error}`);
        break;
      case 'diagram_start':
        this.update('diagrams', { total: numberDetail(event, 'totalDiagrams') });
        break;
      case 'diagram_complete':
        this.advance('diagrams');
        break;
      case 'codeblock_start':
        this.update('codeBlocks', { total: numberDetail(event, 'totalCodeBlocks') });
        break;
      case 'codeblock_complete':
        this.advance('codeBlocks');
        break;
      case 'image_start':
        this.update('images', {
          total: numberDetail(event, 'total'),
          currentFileName: typeof event.details?.fileName === 'string' ? event.details.fileName : '',
        });
        break;
      case 'image_phase':
        this.update('images', {
          currentPhase: typeof event.details?.phase === 'string' ? event.details.phase : '',
        });
        break;
      case 'image_complete':
        this.advance('images');
        break;
      case 'warning_slow_operation': {
        const message = warningMessage(event);
        if (message) this.setWarning(message);
        break;
      }
    }
    this.onChange();
  }

  /** Toggles pause on the underlying pause controller. */
  togglePause(): void {
    if (this.disposed || this.isCancelled || this.isCompleted) return;
    if (this.isPaused) {
      this.deps.pauseController.resume();
      this.isPaused = false;
    } else {
      this.deps.pauseController.pause();
      this.isPaused = true;
    }
    this.onChange();
  }

  /** Cancels the export and notifies the caller after a short grace period. */
  cancel(): void {
    if (this.disposed || this.isCancelled || this.isCompleted) return;
    this.isCancelled = true;
    this.deps.token.cancel();
    this.deps.pauseController.resume();
    this.isPaused = false;
    this.warning = 'Cancelling... Please wait for current operation to complete.';
    this.resultTimer = setTimeout(() => this.deps.onCancel(), 500);
    this.onChange();
  }

  /** Finishes only when the export command confirms that rendering has settled. */
  complete(): void {
    if (this.disposed || this.isCancelled || this.isCompleted) return;
    this.isCompleted = true;
    this.currentNote = null;
    this.remainingTime = 0;
    this.resultTimer = setTimeout(() => this.deps.onComplete(), 1000);
    this.onChange();
  }

  private handleNoteComplete(event: RenderEvent): void {
    const current = this.currentNote;
    if (!current) return;

    this.completedNotes.push(completedNoteFrom(current, event));
    this.currentNote = null;

  }

  private update(
    type: 'diagrams' | 'codeBlocks' | 'images',
    updates: Partial<{ total: number; processed: number; currentFileName?: string; currentPhase?: string }>,
  ): void {
    if (!this.currentNote) return;
    this.currentNote = updateNoteProgress(this.currentNote, type, updates);
  }

  private advance(type: 'diagrams' | 'codeBlocks' | 'images'): void {
    if (!this.currentNote) return;
    this.currentNote = updateNoteProgress(this.currentNote, type, {
      processed: this.currentNote[type].processed + 1,
    });
  }

  private setWarning(message: string | null): void {
    this.warning = message;
    if (this.warningTimer !== null) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    if (message !== null) {
      this.warningTimer = setTimeout(() => {
        this.warning = null;
        this.onChange();
      }, WARNING_TIMEOUT_MS);
    }
  }
}

function numberDetail(event: RenderEvent, key: string): number {
  const value = event.details?.[key];
  return typeof value === 'number' ? value : 0;
}

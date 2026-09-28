import type { ExportMetrics } from '../utils/wikiExportOrchestrator';
import type { CancellationToken } from '../utils/cancellationToken';
import type { PauseController } from '../utils/pauseController';
import type { RenderEvent } from '../utils/detailedRenderer';
import type { CompletedNote, CurrentNoteProgress } from './types';
import {
  calculateCurrentNoteProgress,
  completedNoteFrom,
  currentNoteFromEvent,
  formatDuration,
  updateNoteProgress,
  warningMessage,
} from '../utils/renderProgress';

const WARNING_TIMEOUT_MS = 5000;

export interface RenderingProgressDeps {
  metrics: ExportMetrics;
  token: CancellationToken;
  pauseController: PauseController;
  onComplete: () => void;
  onCancel: () => void;
}

/**
 * Reactive state and event handling for the rendering progress view.
 * The Svelte component is a thin template over this store.
 */
export class RenderingProgressStore {
  completedNotes = $state<CompletedNote[]>([]);
  currentNote = $state<CurrentNoteProgress | null>(null);
  isPaused = $state(false);
  isCancelled = $state(false);
  isCompleted = $state(false);
  elapsedTime = $state(0);
  remainingTime = $state<number | null>(null);
  speed = $state<string>('Starting...');
  warning = $state<string | null>(null);
  completedOpen = $state(true);

  readonly overallProgress = $derived.by(() => {
    const total = this.deps.metrics.totalNotes;
    if (total <= 0) return 0;

    const notesProgress = this.completedNotes.length / total;
    if (!this.currentNote) {
      return Math.round(notesProgress * 100);
    }
    const currentProgress = calculateCurrentNoteProgress(this.currentNote);
    return Math.min(100, Math.round(notesProgress * 100 + currentProgress * (100 / total)));
  });

  readonly elapsedLabel = $derived(formatDuration(this.elapsedTime));
  readonly remainingLabel = $derived(
    this.remainingTime !== null ? `~${formatDuration(this.remainingTime)}` : 'Calculating...',
  );

  private readonly deps: RenderingProgressDeps;
  private readonly startTime = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;
  private warningTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: RenderingProgressDeps) {
    this.deps = deps;
  }

  /** Starts the elapsed-time ticker. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /** Stops all timers. Call when the view unmounts. */
  dispose(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.warningTimer !== null) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
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
  }

  /** Applies a render event to the progress state. */
  handleEvent(event: RenderEvent): void {
    if (this.isCancelled) return;

    switch (event.type) {
      case 'note_start':
        this.currentNote = currentNoteFromEvent(event, this.completedNotes.length, this.deps.metrics.totalNotes);
        break;
      case 'note_complete':
        this.handleNoteComplete(event);
        break;
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
  }

  /** Toggles pause on the underlying pause controller. */
  togglePause(): void {
    if (this.isPaused) {
      this.deps.pauseController.resume();
      this.isPaused = false;
    } else {
      this.deps.pauseController.pause();
      this.isPaused = true;
    }
  }

  /** Cancels the export and notifies the caller after a short grace period. */
  cancel(): void {
    this.isCancelled = true;
    this.deps.token.cancel();
    this.warning = 'Cancelling... Please wait for current operation to complete.';
    setTimeout(() => this.deps.onCancel(), 500);
  }

  private handleNoteComplete(event: RenderEvent): void {
    const current = this.currentNote;
    if (!current) return;

    this.completedNotes = [...this.completedNotes, completedNoteFrom(current, event)];
    this.currentNote = null;

    if (this.completedNotes.length === this.deps.metrics.totalNotes && !this.isCancelled) {
      this.isCompleted = true;
      setTimeout(() => this.deps.onComplete(), 1000);
    }
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
      }, WARNING_TIMEOUT_MS);
    }
  }
}

function numberDetail(event: RenderEvent, key: string): number {
  const value = event.details?.[key];
  return typeof value === 'number' ? value : 0;
}

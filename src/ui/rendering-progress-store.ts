import type { RenderEvent } from '../utils/detailedRenderer';
import type { RenderingProgressProps } from './types';
import { formatDuration } from '../utils/renderProgress';
import {
  applyProgressEvent,
  cancelProgress,
  completeProgress,
  createProgressState,
  noteElapsed,
  overallProgress,
  tickProgress,
  togglePause,
  type ProgressState,
} from './progress-core';

const RESULT_DELAY_MS = 1000;
const CANCEL_DELAY_MS = 500;
const WARNING_TIMEOUT_MS = 5000;

/**
 * Owns timers and side effects for the rendering progress view.
 * All state transitions live in ./progress-core and are pure.
 */
export class RenderingProgressStore {
  private state: ProgressState = createProgressState();
  private timer: ReturnType<typeof setInterval> | null = null;
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly deps: RenderingProgressProps,
    private readonly onChange: () => void = () => {},
  ) {}

  get completedNotes() {
    return this.state.completedNotes;
  }

  get currentNote() {
    return this.state.currentNote;
  }

  get isPaused() {
    return this.state.isPaused;
  }

  get isCancelled() {
    return this.state.isCancelled;
  }

  get isCompleted() {
    return this.state.isCompleted;
  }

  get warning() {
    return this.state.warning;
  }

  /** Weighted overall progress in percent. */
  get overallProgress(): number {
    return overallProgress(this.state, this.deps.metrics.totalNotes);
  }

  get elapsedLabel(): string {
    return formatDuration(this.state.elapsedTime);
  }

  get remainingLabel(): string {
    return this.state.remainingTime !== null ? `~${formatDuration(this.state.remainingTime)}` : 'Calculating...';
  }

  get speed(): string {
    return this.state.speed;
  }

  /** Time spent on the note currently being rendered. */
  get noteElapsed(): number {
    return noteElapsed(this.state, Date.now());
  }

  /** Starts the elapsed-time ticker. */
  start(): void {
    if (this.disposed || this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /** Stops all timers. Call when the view unmounts. */
  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearInterval(this.timer);
    if (this.resultTimer !== null) clearTimeout(this.resultTimer);
    if (this.warningTimer !== null) clearTimeout(this.warningTimer);
    this.timer = this.resultTimer = this.warningTimer = null;
  }

  /** Applies a render event to the progress state. */
  handleEvent(event: RenderEvent): void {
    if (this.disposed) return;
    const { state } = applyProgressEvent(this.state, event, this.deps.metrics.totalNotes);
    this.state = state;
    if (state.warning !== null) this.scheduleWarningClear();
    this.onChange();
  }

  /** Toggles pause on the underlying pause controller. */
  togglePause(): void {
    if (this.disposed) return;
    const { state, effect } = togglePause(this.state);
    this.state = state;
    if (effect.kind === 'pause') this.deps.pauseController.pause();
    if (effect.kind === 'resume') this.deps.pauseController.resume();
    this.onChange();
  }

  /** Cancels the export and notifies the caller after a short grace period. */
  cancel(): void {
    if (this.disposed) return;
    const { state, effect } = cancelProgress(this.state);
    this.state = state;
    if (effect.kind === 'cancel') {
      this.deps.token.cancel();
      this.deps.pauseController.resume();
      this.scheduleResult(this.deps.onCancel, CANCEL_DELAY_MS);
    }
    this.onChange();
  }

  /** Finishes only when the export command confirms that rendering has settled. */
  complete(): void {
    if (this.disposed) return;
    this.state = completeProgress(this.state);
    this.scheduleResult(this.deps.onComplete, RESULT_DELAY_MS);
    this.onChange();
  }

  private tick(): void {
    if (this.disposed) return;
    this.state = tickProgress(this.state, Date.now(), this.deps.metrics.totalNotes);
    this.onChange();
  }

  private scheduleResult(callback: () => void, delay: number): void {
    if (this.resultTimer !== null) clearTimeout(this.resultTimer);
    this.resultTimer = setTimeout(callback, delay);
  }

  private scheduleWarningClear(): void {
    if (this.warningTimer !== null) clearTimeout(this.warningTimer);
    this.warningTimer = setTimeout(() => {
      this.state = { ...this.state, warning: null };
      this.onChange();
    }, WARNING_TIMEOUT_MS);
  }
}

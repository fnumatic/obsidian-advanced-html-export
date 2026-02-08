import { App, Modal, ButtonComponent } from 'obsidian';
import { CancellationToken } from '../utils/cancellationToken';
import { PauseController } from '../utils/pauseController';
import { RenderEvent } from '../utils/detailedRenderer';
import { ExportMetrics, NoteInfo } from '../utils/wikiExportOrchestrator';

interface CompletedNote {
  title: string;
  path: string;
  duration: number;
  totalDiagrams: number;
  totalCodeBlocks: number;
  totalImages: number;
}

interface CurrentNoteProgress {
  title: string;
  path: string;
  index: number;
  total: number;
  
  diagrams: {
    total: number;
    processed: number;
    currentType?: string;
  };
  
  codeBlocks: {
    total: number;
    processed: number;
    currentLanguage?: string;
  };
  
  images: {
    total: number;
    processed: number;
    currentFileName?: string;
    currentPhase?: string;
  };
  
  overallProgress: number;
}

export class RenderingProgressModal extends Modal {
  private token: CancellationToken;
  private pauseController: PauseController;
  private metrics: ExportMetrics;
  private resolvePromise: ((result: boolean) => void) | null = null;

  // State
  private completedNotes: CompletedNote[] = [];
  private currentNote: CurrentNoteProgress | null = null;
  private isCancelled = false;
  private isCompleted = false;
  private startTime = Date.now();
  private totalNotesRendered = 0;

  // UI Elements
  private completedSectionEl!: HTMLDetailsElement;
  private completedListEl!: HTMLElement;
  private currentSectionEl!: HTMLElement;
  private overallProgressBar!: HTMLElement;
  private overallProgressText!: HTMLElement;
  private currentNoteTitleEl!: HTMLElement;
  private diagramProgressEl!: HTMLElement;
  private codeblockProgressEl!: HTMLElement;
  private imageProgressEl!: HTMLElement;
  private warningEl!: HTMLElement;
  private timeStatsEl!: HTMLElement;
  private pauseButton!: ButtonComponent;
  private cancelButton!: ButtonComponent;
  private pauseStatusEl!: HTMLElement;

  constructor(
    app: App,
    token: CancellationToken,
    pauseController: PauseController,
    metrics: ExportMetrics,
    _notes: NoteInfo[]
  ) {
    super(app);
    this.token = token;
    this.pauseController = pauseController;
    this.metrics = metrics;
  }

  async openAndAwait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    // Prevent closing by clicking outside
    this.modalEl.style.pointerEvents = 'auto';

    // Header
    contentEl.createEl('h2', { text: 'Rendering Wiki Export' });

    // Completed Notes Section (collapsible, open by default)
    this.completedSectionEl = contentEl.createEl('details') as HTMLDetailsElement;
    this.completedSectionEl.open = true;
    const completedSummary = this.completedSectionEl.createEl('summary');
    completedSummary.style.cssText = `
      font-weight: 600;
      font-size: 1.1em;
      cursor: pointer;
      padding: 8px 0;
    `;
    completedSummary.textContent = 'Completed Notes (0)';
    (completedSummary as any).updateCount = (count: number) => {
      completedSummary.textContent = `Completed Notes (${count})`;
    };

    this.completedListEl = this.completedSectionEl.createDiv('completed-notes-list');
    this.completedListEl.style.cssText = `
      min-height: 114px;
      max-height: 114px;
      overflow-y: auto;
      border: 1px solid var(--background-modifier-border);
      border-radius: 6px;
      padding: 6px;
      margin-top: 8px;
    `;

    // Current Note Section
    this.currentSectionEl = contentEl.createDiv('current-note-section');
    this.currentSectionEl.style.cssText = `
      margin-top: 12px;
      padding: 10px;
      background: var(--background-secondary);
      border-radius: 6px;
    `;

    // Overall Progress
    const overallProgressContainer = this.currentSectionEl.createDiv();
    overallProgressContainer.style.marginBottom = '16px';
    
    this.currentNoteTitleEl = overallProgressContainer.createDiv();
    this.currentNoteTitleEl.style.cssText = `
      font-weight: 600;
      font-size: 1.1em;
      margin-bottom: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    this.currentNoteTitleEl.textContent = 'Preparing...';

    // Progress bar container
    const progressBarContainer = overallProgressContainer.createDiv();
    progressBarContainer.style.cssText = `
      width: 100%;
      height: 18px;
      background: var(--background-modifier-border);
      border-radius: 9px;
      overflow: hidden;
      position: relative;
    `;

    this.overallProgressBar = progressBarContainer.createDiv();
    this.overallProgressBar.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, var(--interactive-accent) 0%, var(--interactive-accent-hover) 100%);
      width: 0%;
      transition: width 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    this.overallProgressText = this.overallProgressBar.createSpan();
    this.overallProgressText.style.cssText = `
      color: white;
      font-size: 0.85em;
      font-weight: 600;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    `;
    this.overallProgressText.textContent = '0%';

    // Detailed Progress (always visible)
    const detailsContainer = this.currentSectionEl.createDiv('detailed-progress');
    detailsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    `;

    // Diagrams progress
    this.diagramProgressEl = this.createDetailProgressRow(
      detailsContainer,
      '📊',
      'Diagrams',
      'diagram'
    );

    // Code blocks progress
    this.codeblockProgressEl = this.createDetailProgressRow(
      detailsContainer,
      '📝',
      'Code blocks',
      'codeblock'
    );

    // Images progress
    this.imageProgressEl = this.createDetailProgressRow(
      detailsContainer,
      '🖼️',
      'Images',
      'image'
    );

    // Warning area for slow operations
    this.warningEl = this.currentSectionEl.createDiv('warning-area');
    this.warningEl.style.cssText = `
      margin-top: 8px;
      padding: 6px 8px;
      background: var(--background-modifier-error);
      color: var(--text-error);
      border-radius: 4px;
      display: none;
      font-size: 0.85em;
    `;

    // Time stats
    this.timeStatsEl = contentEl.createDiv('time-stats');
    this.timeStatsEl.style.cssText = `
      margin-top: 10px;
      padding: 8px;
      background: var(--background-modifier-form-field);
      border-radius: 4px;
      display: flex;
      justify-content: space-around;
      font-size: 0.85em;
    `;
    this.updateTimeStats();

    // Pause status indicator
    // Bottom row container (status left, buttons right)
    const bottomContainer = contentEl.createDiv();
    bottomContainer.style.cssText = `
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    `;

    // Status indicator (left side)
    this.pauseStatusEl = bottomContainer.createDiv('pause-status');
    this.pauseStatusEl.style.cssText = `
      font-weight: 600;
      color: var(--text-warning);
      font-size: 0.95em;
      visibility: hidden;
    `;
    this.pauseStatusEl.textContent = '⏸️ PAUSED';

    // Button container (right side)
    const buttonContainer = bottomContainer.createDiv();
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
    `;

    // Pause/Resume button
    this.pauseButton = new ButtonComponent(buttonContainer)
      .setButtonText('⏸️ Pause')
      .onClick(() => {
        this.handlePauseToggle();
      });

    // Cancel button
    this.cancelButton = new ButtonComponent(buttonContainer)
      .setButtonText('Cancel Export')
      .setWarning()
      .onClick(() => {
        this.handleCancel();
      });

    // Start time update interval
    setInterval(() => this.updateTimeStats(), 1000);
  }

  private handlePauseToggle(): void {
    if (this.pauseController.isPaused) {
      this.pauseController.resume();
      this.pauseButton.setButtonText('⏸️ Pause');
      this.pauseStatusEl.style.visibility = 'hidden';
    } else {
      this.pauseController.pause();
      this.pauseButton.setButtonText('▶️ Resume');
      this.pauseStatusEl.style.visibility = 'visible';
    }
  }

  private createDetailProgressRow(
    container: HTMLElement,
    icon: string,
    label: string,
    type: string
  ): HTMLElement {
    const row = container.createDiv(`${type}-progress-row`);
    row.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 0.85em;
    `;

    // Line 1: Icon + Label + inline Progress Bar + Count
    const line1El = row.createDiv(`${type}-line1`);
    line1El.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    const iconEl = line1El.createSpan();
    iconEl.style.fontSize = '1em';
    iconEl.textContent = icon;

    const labelEl = line1El.createSpan();
    labelEl.style.whiteSpace = 'nowrap';
    labelEl.textContent = label;

    // Inline progress bar (small)
    const progressContainer = line1El.createDiv();
    progressContainer.style.cssText = `
      flex: 1;
      height: 6px;
      background: var(--background-modifier-border);
      border-radius: 3px;
      overflow: hidden;
      min-width: 60px;
    `;

    const progressBar = progressContainer.createDiv(`${type}-progress-bar`);
    progressBar.style.cssText = `
      height: 100%;
      background: var(--interactive-accent);
      width: 0%;
      transition: width 0.2s ease;
    `;

    const countEl = line1El.createSpan(`${type}-count`);
    countEl.style.cssText = 'color: var(--text-muted); white-space: nowrap;';
    countEl.textContent = '0/0';

    // Line 2: Status text
    const statusEl = row.createDiv(`${type}-status`);
    statusEl.style.cssText = `
      font-size: 0.8em;
      color: var(--text-muted);
      height: 14px;
      padding-left: 22px;
    `;

    return row;
  }

  private updateDetailProgress(
    rowEl: HTMLElement,
    processed: number,
    total: number,
    currentStatus?: string
  ): void {
    const countEl = rowEl.querySelector(`.${rowEl.className.split('-')[0]}-count`);
    const progressBar = rowEl.querySelector(`.${rowEl.className.split('-')[0]}-progress-bar`);
    const statusEl = rowEl.querySelector(`.${rowEl.className.split('-')[0]}-status`);

    if (countEl) countEl.textContent = `${processed}/${total}`;
    if (progressBar) {
      const percent = total > 0 ? (processed / total) * 100 : 0;
      (progressBar as HTMLElement).style.width = `${percent}%`;
    }
    if (statusEl) {
      (statusEl as HTMLElement).textContent = currentStatus || '';
    }
  }

  handleEvent(event: RenderEvent): void {
    if (this.isCancelled) return;

    switch (event.type) {
      case 'note_start':
        this.handleNoteStart(event);
        break;
      case 'note_complete':
        this.handleNoteComplete(event);
        break;
      case 'note_error':
        this.handleNoteError(event);
        break;
      case 'diagram_start':
        this.handleDiagramStart(event);
        break;
      case 'image_start':
        this.handleImageStart(event);
        break;
      case 'image_phase':
        this.handleImagePhase(event);
        break;
      case 'image_complete':
        this.handleImageComplete(event);
        break;
      case 'warning_slow_operation':
        this.handleWarning(event);
        break;
    }

    this.updateOverallProgress();
  }

  private handleNoteStart(event: RenderEvent): void {
    const index = this.completedNotes.length;
    this.currentNote = {
      title: event.noteTitle || 'Unknown',
      path: event.notePath || '',
      index: index,
      total: this.metrics.totalNotes,
      diagrams: { total: (event.details?.totalDiagrams as number) || 0, processed: 0 },
      codeBlocks: { total: (event.details?.totalCodeBlocks as number) || 0, processed: 0 },
      images: { total: (event.details?.totalImages as number) || 0, processed: 0 },
      overallProgress: 0
    };

    // Truncate title to 40 characters
    const truncatedTitle = this.currentNote.title.length > 40 
      ? this.currentNote.title.slice(0, 40) + '...' 
      : this.currentNote.title;
    this.currentNoteTitleEl.textContent = `Rendering ${index + 1}/${this.metrics.totalNotes}: ${truncatedTitle}`;

    // Initialize codeblock progress display
    this.updateDetailProgress(
      this.codeblockProgressEl,
      0,
      this.currentNote.codeBlocks.total,
      this.currentNote.codeBlocks.total > 0 ? 'Pending...' : 'None'
    );
  }

  private handleNoteComplete(event: RenderEvent): void {
    if (!this.currentNote) return;

    const completedNote: CompletedNote = {
      title: this.currentNote.title,
      path: this.currentNote.path,
      duration: (event.details?.duration as number) || 0,
      totalDiagrams: (event.details?.totalDiagrams as number) || 0,
      totalCodeBlocks: (event.details?.totalCodeBlocks as number) || 0,
      totalImages: (event.details?.totalImages as number) || 0
    };

    this.completedNotes.push(completedNote);
    this.totalNotesRendered++;

    // Add to completed list
    const noteItem = this.completedListEl.createDiv('completed-note-item');
    noteItem.style.cssText = `
      padding: 2px 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8em;
    `;

    const leftEl = noteItem.createDiv();
    leftEl.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      overflow: hidden;
    `;
    
    const checkmarkEl = leftEl.createSpan();
    checkmarkEl.textContent = '✓';
    
    const titleEl = leftEl.createSpan();
    titleEl.style.cssText = `
      max-width: 360px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    
    // Truncate to 60 characters
    const truncatedTitle = completedNote.title.length > 60 
      ? completedNote.title.slice(0, 60) + '...' 
      : completedNote.title;
    titleEl.textContent = truncatedTitle;
    titleEl.title = completedNote.title;

    const rightEl = noteItem.createDiv();
    rightEl.style.cssText = 'color: var(--text-muted); font-size: 0.85em;';
    rightEl.textContent = `${(completedNote.duration / 1000).toFixed(1)}s · ${completedNote.totalDiagrams}📊 ${completedNote.totalCodeBlocks}📝 ${completedNote.totalImages}🖼️`;

    // Update header count
    const summary = this.completedSectionEl.querySelector('summary');
    if (summary && (summary as any).updateCount) {
      (summary as any).updateCount(this.completedNotes.length);
    }

    // Scroll to bottom
    this.completedListEl.scrollTop = this.completedListEl.scrollHeight;

    this.currentNote = null;

    // Check if all notes are completed - auto-close
    if (this.completedNotes.length === this.metrics.totalNotes && !this.isCancelled) {
      this.isCompleted = true;
      this.currentNoteTitleEl.textContent = '✅ Rendering complete!';
      this.overallProgressBar.style.width = '100%';
      this.overallProgressText.textContent = '100%';

      // Auto-close after short delay to show completion
      setTimeout(() => {
        this.resolve?.(true);
        this.close();
      }, 1000);
    }
  }

  private handleNoteError(event: RenderEvent): void {
    this.showWarning(`Error rendering ${event.noteTitle}: ${event.details?.error}`);
  }

  private handleDiagramStart(event: RenderEvent): void {
    if (!this.currentNote) return;
    this.currentNote.diagrams.total = (event.details?.totalDiagrams as number) || 0;
    this.updateDetailProgress(
      this.diagramProgressEl,
      this.currentNote.diagrams.processed,
      this.currentNote.diagrams.total,
      'Rendering...'
    );
  }

  private handleImageStart(event: RenderEvent): void {
    if (!this.currentNote) return;
    this.currentNote.images.total = (event.details?.total as number) || 0;
    this.currentNote.images.currentFileName = (event.details?.fileName as string) || '';
    this.updateDetailProgress(
      this.imageProgressEl,
      this.currentNote.images.processed,
      this.currentNote.images.total,
      `Processing: ${this.currentNote.images.currentFileName}`
    );
  }

  private handleImagePhase(event: RenderEvent): void {
    if (!this.currentNote) return;
    this.currentNote.images.currentPhase = (event.details?.phase as string) || '';
    const phaseNames: Record<string, string> = {
      'reading': 'Reading...',
      'hashing': 'Hashing...',
      'optimizing': 'Optimizing...'
    };
    this.updateDetailProgress(
      this.imageProgressEl,
      this.currentNote.images.processed,
      this.currentNote.images.total,
      phaseNames[this.currentNote.images.currentPhase] || this.currentNote.images.currentPhase
    );
  }

  private handleImageComplete(_event: RenderEvent): void {
    if (!this.currentNote) return;
    this.currentNote.images.processed++;
    this.updateDetailProgress(
      this.imageProgressEl,
      this.currentNote.images.processed,
      this.currentNote.images.total,
      'Done'
    );
  }

  private handleWarning(event: RenderEvent): void {
    const details = event.details;
    if (details?.operation === 'image_processing') {
      const duration = typeof details.duration === 'number' ? details.duration : 0;
      this.showWarning(`⚠️ Slow operation: ${details.fileName} (${(duration / 1000).toFixed(1)}s)`);
    } else if (details?.operation === 'markdown_render') {
      const duration = typeof details.duration === 'number' ? details.duration : 0;
      this.showWarning(`⚠️ Note is taking long to render: ${details.noteName} (${(duration / 1000).toFixed(1)}s)`);
    }
  }

  private showWarning(message: string): void {
    this.warningEl.style.display = 'block';
    this.warningEl.textContent = message;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (!this.isCancelled) {
        this.warningEl.style.display = 'none';
      }
    }, 5000);
  }

  private updateOverallProgress(): void {
    if (!this.currentNote) return;

    // Calculate overall progress
    const notesProgress = this.completedNotes.length / this.metrics.totalNotes;
    const currentNoteProgress = this.calculateCurrentNoteProgress();
    const overallProgress = (notesProgress * 100) + (currentNoteProgress * (100 / this.metrics.totalNotes));

    const percent = Math.min(100, Math.round(overallProgress));
    this.overallProgressBar.style.width = `${percent}%`;
    this.overallProgressText.textContent = `${percent}%`;
  }

  private calculateCurrentNoteProgress(): number {
    if (!this.currentNote) return 0;

    const diagramWeight = 0.3;
    const codeblockWeight = 0.2;
    const imageWeight = 0.5;

    const diagramProgress = this.currentNote.diagrams.total > 0
      ? this.currentNote.diagrams.processed / this.currentNote.diagrams.total
      : 0;

    const codeblockProgress = this.currentNote.codeBlocks.total > 0
      ? this.currentNote.codeBlocks.processed / this.currentNote.codeBlocks.total
      : 0;

    const imageProgress = this.currentNote.images.total > 0
      ? this.currentNote.images.processed / this.currentNote.images.total
      : 0;

    return (diagramProgress * diagramWeight) + 
           (codeblockProgress * codeblockWeight) + 
           (imageProgress * imageWeight);
  }

  private updateTimeStats(): void {
    if (this.isCancelled) return;

    const elapsed = Date.now() - this.startTime;
    const elapsedStr = this.formatDuration(elapsed);

    // Calculate remaining time based on average speed
    let remainingStr = 'Calculating...';
    if (this.totalNotesRendered > 0) {
      const avgTimePerNote = elapsed / this.totalNotesRendered;
      const remainingNotes = this.metrics.totalNotes - this.totalNotesRendered;
      const remaining = avgTimePerNote * remainingNotes;
      remainingStr = `~${this.formatDuration(remaining)}`;
    }

    // Calculate speed
    const speed = this.totalNotesRendered > 0
      ? `${(this.totalNotesRendered / (elapsed / 60000)).toFixed(1)} notes/min`
      : 'Starting...';

    this.timeStatsEl.empty();
    this.createTimeStat(this.timeStatsEl, '⏱️ Elapsed', elapsedStr);
    this.createTimeStat(this.timeStatsEl, '⏳ Remaining', remainingStr);
    this.createTimeStat(this.timeStatsEl, '⚡ Speed', speed);
  }

  private createTimeStat(container: HTMLElement, label: string, value: string): void {
    const statEl = container.createDiv();
    statEl.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    `;

    const valueEl = statEl.createDiv();
    valueEl.style.cssText = 'font-weight: 600;';
    valueEl.textContent = value;

    const labelEl = statEl.createDiv();
    labelEl.style.cssText = 'color: var(--text-muted); font-size: 0.85em;';
    labelEl.textContent = label;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  }

  private handleCancel(): void {
    this.isCancelled = true;
    this.token.cancel();
    
    // Update UI
    this.cancelButton.setButtonText('Cancelling...').setDisabled(true);
    this.currentNoteTitleEl.textContent = 'Cancelling export...';
    this.showWarning('Cancelling... Please wait for current operation to complete.');

    // Resolve after short delay to allow cleanup
    setTimeout(() => {
      this.resolve?.(false);
      this.close();
    }, 500);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Ensure we resolve if closed unexpectedly
    if (!this.isCancelled && this.resolvePromise) {
      // Use isCompleted flag or check if all notes are done
      this.resolvePromise(this.isCompleted || this.completedNotes.length === this.metrics.totalNotes);
      this.resolvePromise = null;
    }
  }

  private get resolve(): ((result: boolean) => void) | null {
    return this.resolvePromise;
  }
}

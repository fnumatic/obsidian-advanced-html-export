import { App, Modal, ButtonComponent } from 'obsidian';
import { ExportMetrics, NoteInfo } from '../utils/wikiExportOrchestrator';

export type ExportPreviewAction = 'cancel' | 'exportAll' | 'selectNotes';

interface ExportPreviewResult {
  action: ExportPreviewAction;
  selectedNotes?: NoteInfo[];
}

export class ExportPreviewModal extends Modal {
  private metrics: ExportMetrics;
  private notes: NoteInfo[];
  private resolvePromise: ((result: ExportPreviewResult) => void) | null = null;

  constructor(app: App, metrics: ExportMetrics, notes: NoteInfo[]) {
    super(app);
    this.metrics = metrics;
    this.notes = notes;
  }

  async openAndAwait(): Promise<ExportPreviewResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Export Preview' });

    // Summary section - single row
    const summaryContainer = contentEl.createDiv('export-preview-summary');
    summaryContainer.style.cssText = `
      background: var(--background-modifier-form-field);
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 20px;
      text-align: center;
      font-size: 1.1em;
    `;

    summaryContainer.innerHTML = `
      <span style="font-size: 1.3em;">📄</span>
      <span style="font-weight: 600;">${this.metrics.totalNotes}</span>
      <span style="color: var(--text-muted);">notes</span>
      <span style="margin: 0 12px; color: var(--text-muted);">·</span>
      <span style="font-size: 1.3em;">📊</span>
      <span style="font-weight: 600;">${this.metrics.estimatedDiagrams}</span>
      <span style="color: var(--text-muted);">diagrams</span>
      <span style="margin: 0 12px; color: var(--text-muted);">·</span>
      <span style="font-size: 1.3em;">📝</span>
      <span style="font-weight: 600;">${this.metrics.totalCodeBlocks}</span>
      <span style="color: var(--text-muted);">code blocks</span>
    `;

    // Notes list - show ALL notes with scroll
    if (this.notes.length > 0) {
      const notesSection = contentEl.createDiv('export-notes-preview');
      notesSection.style.marginTop = '20px';
      notesSection.createEl('h3', { text: 'Notes', cls: 'export-section-title' });

      const notesList = notesSection.createDiv();
      notesList.style.cssText = `
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid var(--background-modifier-border);
        border-radius: 6px;
        padding: 8px;
      `;

      this.notes.forEach((note) => {
        const noteEl = notesList.createDiv('preview-note-item');
        noteEl.style.cssText = `
          padding: 6px 8px;
          border-bottom: 1px solid var(--background-modifier-border);
          font-size: 0.9em;
          display: flex;
          justify-content: space-between;
          align-items: center;
        `;
        
        const nameEl = noteEl.createSpan();
        nameEl.textContent = note.title;
        
        const metaEl = noteEl.createSpan();
        metaEl.style.cssText = 'color: var(--text-muted); font-size: 0.85em;';
        metaEl.textContent = `${note.estimatedDiagrams} 📊 · ${note.linkCount} 🔗`;

        // Remove border on last item
        if (note === this.notes[this.notes.length - 1]) {
          noteEl.style.borderBottom = 'none';
        }
      });
    }

    // Buttons
    const buttonContainer = contentEl.createDiv('export-preview-buttons');
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--background-modifier-border);
    `;

    // Cancel button
    new ButtonComponent(buttonContainer)
      .setButtonText('Cancel')
      .onClick(() => {
        this.resolve?.({ action: 'cancel' });
        this.close();
      });

    // Select notes button
    new ButtonComponent(buttonContainer)
      .setButtonText('Select Notes')
      .setCta()
      .onClick(() => {
        this.resolve?.({ action: 'selectNotes' });
        this.close();
      });

    // Export all button
    new ButtonComponent(buttonContainer)
      .setButtonText('Export All')
      .setWarning()
      .onClick(() => {
        this.resolve?.({ action: 'exportAll' });
        this.close();
      });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    if (this.resolvePromise) {
      this.resolvePromise({ action: 'cancel' });
      this.resolvePromise = null;
    }
  }

  private get resolve(): ((result: ExportPreviewResult) => void) | null {
    return this.resolvePromise;
  }
}

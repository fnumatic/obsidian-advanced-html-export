// src/ui/modals/ExportPreviewModal.ts
// Wrapper class that bridges Svelte ExportPreview component with Obsidian's Modal API

import { App, Modal } from 'obsidian';
import { mount, unmount } from 'svelte';
import ExportPreview from '../../components/ExportPreview.svelte';
import type { ExportMetrics, NoteInfo } from '../../utils/wikiExportOrchestrator';

export type ExportPreviewAction = 'cancel' | 'exportAll' | 'selectNotes';

interface ExportPreviewResult {
  action: ExportPreviewAction;
  selectedNotes?: NoteInfo[];
}

export class ExportPreviewModal extends Modal {
  private metrics: ExportMetrics;
  private notes: NoteInfo[];
  private resolvePromise: ((result: ExportPreviewResult) => void) | null = null;
  private component: ReturnType<typeof mount> | null = null;

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

    // Add scoped class for modal dimension overrides
    this.modalEl.addClass('advanced-html-export-modal');

    // Mount Svelte component
    this.component = mount(ExportPreview, {
      target: contentEl,
      props: {
        metrics: this.metrics,
        notes: this.notes,
        onAction: (action: ExportPreviewAction) => {
          this.handleAction(action);
        }
      }
    });
  }

  private handleAction(action: ExportPreviewAction): void {
    if (this.resolvePromise) {
      this.resolvePromise({ action });
      this.resolvePromise = null;
    }
    this.close();
  }

  onClose(): void {
    // Unmount Svelte component
    if (this.component) {
      unmount(this.component);
      this.component = null;
    }

    const { contentEl } = this;
    contentEl.empty();

    // Ensure we resolve if closed unexpectedly (e.g., Escape key)
    if (this.resolvePromise) {
      this.resolvePromise({ action: 'cancel' });
      this.resolvePromise = null;
    }
  }
}

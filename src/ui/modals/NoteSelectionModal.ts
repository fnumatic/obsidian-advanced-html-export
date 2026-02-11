// src/ui/modals/NoteSelectionModal.ts
// Wrapper class that bridges Svelte NoteSelection component with Obsidian's Modal API

import { App, Modal } from 'obsidian';
import { mount, unmount } from 'svelte';
import NoteSelection from '../../components/NoteSelection.svelte';
import type { NoteInfo } from '../../utils/wikiExportOrchestrator';

export class NoteSelectionModal extends Modal {
  private notes: NoteInfo[];
  private resolvePromise: ((selected: NoteInfo[] | null) => void) | null = null;
  private component: ReturnType<typeof mount> | null = null;

  constructor(app: App, notes: NoteInfo[]) {
    super(app);
    this.notes = notes;
  }

  async openAndAwait(): Promise<NoteInfo[] | null> {
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
    this.component = mount(NoteSelection, {
      target: contentEl,
      props: {
        notes: this.notes,
        onConfirm: (selected: NoteInfo[]) => {
          this.handleConfirm(selected);
        },
        onCancel: () => {
          this.handleCancel();
        }
      }
    });
  }

  private handleConfirm(selected: NoteInfo[]): void {
    if (this.resolvePromise) {
      this.resolvePromise(selected);
      this.resolvePromise = null;
    }
    this.close();
  }

  private handleCancel(): void {
    if (this.resolvePromise) {
      this.resolvePromise(null);
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
      this.resolvePromise(null);
      this.resolvePromise = null;
    }
  }
}

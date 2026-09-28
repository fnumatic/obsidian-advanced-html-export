// src/ui/modals/ExportPreviewModal.ts
// Wrapper class that bridges the Svelte ExportPreview component with Obsidian's Modal API

import { App } from 'obsidian';
import { mount } from 'svelte';
import ExportPreview from '../../components/ExportPreview.svelte';
import type { ExportMetrics, NoteInfo } from '../../utils/wikiExportOrchestrator';
import { SvelteModal } from './SvelteModal';

export type ExportPreviewAction = 'cancel' | 'exportAll' | 'selectNotes';

interface ExportPreviewResult {
  action: ExportPreviewAction;
  selectedNotes?: NoteInfo[];
}

export class ExportPreviewModal extends SvelteModal<ExportPreviewResult> {
  private metrics: ExportMetrics;
  private notes: NoteInfo[];

  constructor(app: App, metrics: ExportMetrics, notes: NoteInfo[]) {
    super(app);
    this.metrics = metrics;
    this.notes = notes;
  }

  protected mountComponent(target: HTMLElement): ReturnType<typeof mount> {
    return mount(ExportPreview, {
      target,
      props: {
        metrics: this.metrics,
        notes: this.notes,
        onAction: (action: ExportPreviewAction) => this.finish({ action }),
      },
    });
  }

  protected getFallbackResult(): ExportPreviewResult {
    return { action: 'cancel' };
  }
}

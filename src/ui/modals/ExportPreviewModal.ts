import { App } from 'obsidian';
import type { ExportMetrics, NoteInfo } from '../../utils/wikiExportOrchestrator';
import type { ModalView } from '../view';
import type { ExportPreviewAction } from '../types';
import { createExportPreviewView } from '../views/export-preview-view';
import { ViewModal } from './ViewModal';

interface ExportPreviewResult {
  action: ExportPreviewAction;
  selectedNotes?: NoteInfo[];
}

export class ExportPreviewModal extends ViewModal<ExportPreviewResult> {
  private metrics: ExportMetrics;
  private notes: NoteInfo[];

  constructor(app: App, metrics: ExportMetrics, notes: NoteInfo[]) {
    super(app);
    this.metrics = metrics;
    this.notes = notes;
  }

  protected createView(target: HTMLElement): ModalView {
    return createExportPreviewView(target, {
      metrics: this.metrics,
      notes: this.notes,
      onAction: (action: ExportPreviewAction) => this.finish({ action }),
    });
  }

  protected getFallbackResult(): ExportPreviewResult {
    return { action: 'cancel' };
  }
}

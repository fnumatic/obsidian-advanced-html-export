import { App } from 'obsidian';
import type { NoteInfo } from '../../utils/wikiExportOrchestrator';
import type { ModalView } from '../view';
import { createNoteSelectionView } from '../views/note-selection-view';
import { ViewModal } from './ViewModal';

export class NoteSelectionModal extends ViewModal<NoteInfo[] | null> {
  private notes: NoteInfo[];

  constructor(app: App, notes: NoteInfo[]) {
    super(app);
    this.notes = notes;
  }

  protected createView(target: HTMLElement): ModalView {
    return createNoteSelectionView(target, {
      notes: this.notes,
      onConfirm: (selected: NoteInfo[]) => this.finish(selected),
      onCancel: () => this.finish(null),
    });
  }

  protected getFallbackResult(): NoteInfo[] | null {
    return null;
  }
}

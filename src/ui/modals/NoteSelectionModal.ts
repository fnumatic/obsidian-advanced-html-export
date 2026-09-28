// src/ui/modals/NoteSelectionModal.ts
// Wrapper class that bridges the Svelte NoteSelection component with Obsidian's Modal API

import { App } from 'obsidian';
import { mount } from 'svelte';
import NoteSelection from '../../components/NoteSelection.svelte';
import type { NoteInfo } from '../../utils/wikiExportOrchestrator';
import { SvelteModal } from './SvelteModal';

export class NoteSelectionModal extends SvelteModal<NoteInfo[] | null> {
  private notes: NoteInfo[];

  constructor(app: App, notes: NoteInfo[]) {
    super(app);
    this.notes = notes;
  }

  protected mountComponent(target: HTMLElement): ReturnType<typeof mount> {
    return mount(NoteSelection, {
      target,
      props: {
        notes: this.notes,
        onConfirm: (selected: NoteInfo[]) => this.finish(selected),
        onCancel: () => this.finish(null),
      },
    });
  }

  protected getFallbackResult(): NoteInfo[] | null {
    return null;
  }
}

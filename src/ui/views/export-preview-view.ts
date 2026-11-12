import type { ExportPreviewProps } from '../types';
import type { ModalView } from '../view';
import { truncateTitle } from '../../utils/renderProgress';
import { bindAction, button, icon, noteStats, type IconName } from '../view-helpers';

/** Renders the export summary and routes its three choices to the modal. */
export function createExportPreviewView(target: HTMLElement, { metrics, notes, onAction }: ExportPreviewProps): ModalView {
  const events = new AbortController();
  target.empty();

  const container = target.createDiv({ cls: 'p-0', attr: { 'data-tags': 'ep-container' } });
  container.createEl('header', {
    cls: 'mt-0 mb-5 text-obsidian font-semibold',
    text: 'Export preview',
    attr: { 'data-tags': 'ep-header' },
  });

  const summary = container.createEl('section', {
    cls: 'bg-obsidian-alt p-4 rounded-lg mb-5 text-center text-obsidian',
    attr: { 'data-tags': 'ep-summary' },
  });
  const summaryItem = (name: IconName, value: number, label: string): void => {
    icon(summary, name, 'text-[1.25em]');
    summary.createSpan({ cls: 'font-semibold', text: String(value) });
    summary.createSpan({ cls: 'text-obsidian-muted mr-3 ml-1', text: label });
  };
  summaryItem('document', metrics.totalNotes, 'notes');
  summary.createSpan({ cls: 'text-obsidian-muted mx-3', text: '·' });
  summaryItem('chart-bar', metrics.estimatedDiagrams, 'diagrams');
  summary.createSpan({ cls: 'text-obsidian-muted mx-3', text: '·' });
  summaryItem('code-block', metrics.totalCodeBlocks, 'code blocks');

  if (notes.length) {
    const section = container.createEl('section', { cls: 'mt-5', attr: { 'data-tags': 'ep-notes' } });
    section.createEl('h3', { cls: 'mt-5 mb-3 text-obsidian font-semibold', text: 'notes' });
    const list = section.createDiv({ cls: 'max-h-[300px] overflow-y-auto border border-obsidian rounded-md p-2' });
    for (const note of notes) {
      const row = list.createDiv({ cls: 'note-list-item' });
      row.createSpan({
        cls: 'flex-1 max-w-[300px] whitespace-nowrap overflow-hidden text-ellipsis',
        text: truncateTitle(note.title, 60),
        attr: { title: note.title },
      });
      noteStats(row, [
        [note.estimatedDiagrams, 'chart-bar'],
        [note.codeBlockCount ?? 0, 'code-block'],
        [note.analysis?.imageCount ?? 0, 'image'],
        [note.linkCount, 'document'],
      ]);
    }
  }

  const footer = container.createEl('footer', {
    cls: 'flex justify-end gap-3 mt-6 pt-4 border-t border-dimmed',
    attr: { 'data-tags': 'ep-footer' },
  });
  button(footer, 'Cancel', 'cancel');
  button(footer, 'Select notes', 'selectNotes');
  button(footer, 'Export all', 'exportAll', 'obsidian-btn-danger mod-warning');

  for (const name of ['cancel', 'selectNotes', 'exportAll'] as const) {
    bindAction(target, name, () => onAction(name), events.signal);
  }
  return { dispose: (): void => events.abort() };
}

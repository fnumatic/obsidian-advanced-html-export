import type { ExportPreviewProps } from '../types';
import type { ModalView } from '../view';
import { truncateTitle } from '../../utils/renderProgress';
import { bindAction, button, html, icon, noteStats } from '../view-helpers';

/** Renders the export summary and routes its three choices to the modal. */
export function createExportPreviewView(target: HTMLElement, { metrics, notes, onAction }: ExportPreviewProps): ModalView {
  const events = new AbortController();
  target.innerHTML = html`<div data-tags="ep-container" class="p-0">
    <header data-tags="ep-header" class="mt-0 mb-5 text-obsidian font-semibold">Export preview</header>
    <section data-tags="ep-summary" class="bg-obsidian-alt p-4 rounded-lg mb-5 text-center text-obsidian">
      ${icon('document', '1.25em')} <span class="font-semibold">${metrics.totalNotes}</span><span class="text-obsidian-muted mr-3 ml-1">notes</span>
      <span class="text-obsidian-muted mx-3">·</span>${icon('chart-bar', '1.25em')} <span class="font-semibold">${metrics.estimatedDiagrams}</span><span class="text-obsidian-muted mr-3 ml-1">diagrams</span>
      <span class="text-obsidian-muted mx-3">·</span>${icon('code-block', '1.25em')} <span class="font-semibold">${metrics.totalCodeBlocks}</span><span class="text-obsidian-muted ml-1">code blocks</span>
    </section>
    ${notes.length ? html`<section data-tags="ep-notes" class="mt-5"><h3 class="mt-5 mb-3 text-obsidian font-semibold">notes</h3>
      <div class="max-h-[300px] overflow-y-auto border border-obsidian rounded-md p-2">${notes.map(note => html`<div class="note-list-item">
        <span class="flex-1 max-w-[300px] whitespace-nowrap overflow-hidden text-ellipsis" title="${note.title}">${truncateTitle(note.title, 60)}</span>
        ${noteStats([[note.estimatedDiagrams, 'chart-bar'], [note.codeBlockCount ?? 0, 'code-block'], [note.analysis?.imageCount ?? 0, 'image'], [note.linkCount, 'document']])}
      </div>`)}</div></section>` : ''}
    <footer data-tags="ep-footer" class="flex justify-end gap-3 mt-6 pt-4 border-t border-dimmed">
      ${button('Cancel', 'cancel')}${button('Select notes', 'selectNotes')}${button('Export all', 'exportAll', 'obsidian-btn-danger mod-warning')}
    </footer>
  </div>`.value;
  for (const name of ['cancel', 'selectNotes', 'exportAll'] as const) {
    bindAction(target, name, () => onAction(name), events.signal);
  }
  return { dispose: (): void => events.abort() };
}

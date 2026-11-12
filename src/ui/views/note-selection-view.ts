import type { NoteSelectionProps } from '../types';
import type { ModalView } from '../view';
import { html, bindAction, button, element, icon, setText, summaryStat } from '../view-helpers';

/** Builds the selector once and reuses its rows when filtering. */
export function createNoteSelectionView(target: HTMLElement, { notes, onConfirm, onCancel }: NoteSelectionProps): ModalView {
  const events = new AbortController();
  const { signal } = events;
  let selected = new Set(notes.map(note => note.path));
  let warningTimer: ReturnType<typeof setTimeout> | undefined;
  target.innerHTML = html`<div data-tags="ns-container" class="flex flex-col">
    <header data-tags="ns-header" class="flex justify-between items-center mb-4">
      <h2 class="m-0 text-obsidian font-semibold">Select notes</h2>
      <span data-count class="text-obsidian-sm text-obsidian-muted bg-obsidian-alt px-3 py-1 rounded-full"></span>
    </header>
    <aside data-tags="ns-search" class="mb-3"><input type="search" placeholder="Search notes..." aria-label="Search notes" class="obsidian-input"></aside>
    <section data-tags="ns-actions" class="flex gap-2 pb-3 mb-3 border-b border-dimmed">
      ${button('Select all', 'all')}${button('Select none', 'none')}${button('With diagrams only', 'diagrams')}
    </section>
    <main data-tags="ns-list" aria-label="Notes" class="max-h-[400px] overflow-y-auto border-obsidian rounded p-2 flex-1"></main>
    <div data-tags="ns-warning" role="alert" hidden class="my-3 p-2 rounded text-center text-obsidian-sm warning-bg">Please select at least one note.</div>
    <section data-tags="ns-summary" class="mt-4 p-3 bg-obsidian-alt rounded grid grid-cols-3 gap-3 text-center">
      ${summaryStat('', 'selected')}${summaryStat('', 'diagrams')}${summaryStat('', 'estimated time')}
    </section>
    <footer data-tags="ns-footer" class="flex justify-end gap-3 mt-5 pt-4 border-t border-dimmed">
      ${button('Cancel', 'cancel')}${button('Export', 'export', 'obsidian-btn-primary mod-cta')}
    </footer>
  </div>`.value;
  const list = element(target, '[data-tags="ns-list"]');
  const count = element(target, '[data-count]');
  const warning = element(target, '[data-tags="ns-warning"]');
  const search = element<HTMLInputElement>(target, '[data-tags="ns-search"] input');
  const summaries = [...target.querySelectorAll<HTMLElement>('[data-stat-value]')];
  const rows = [...notes].sort((a, b) => b.estimatedDiagrams - a.estimatedDiagrams).map(note => {
    const row = document.createElement('label');
    row.className = 'note-list-item cursor-pointer';
    row.innerHTML = html`<input type="checkbox" data-path="${note.path}" aria-label="Select ${note.title}" class="w-4 h-4 cursor-pointer">
      <div class="flex-1 min-w-0"><div class="whitespace-nowrap overflow-hidden text-ellipsis">${note.title}</div><div class="text-obsidian-muted whitespace-nowrap overflow-hidden text-ellipsis">${note.path}</div></div>
      <span class="text-obsidian-muted">${note.estimatedDiagrams > 0 ? [icon('chart-bar'), note.estimatedDiagrams] : ''}${icon('link')}${note.linkCount}</span>`.value;
    return { note, row, checkbox: element<HTMLInputElement>(row, 'input'), searchText: `${note.title}\n${note.path}`.toLowerCase() };
  });

  const updateSelection = (): void => {
    let diagrams = 0;
    for (const { note, checkbox } of rows) {
      checkbox.checked = selected.has(note.path);
      if (checkbox.checked) diagrams += note.estimatedDiagrams;
    }
    setText(count, `${selected.size}/${notes.length} selected`);
    setText(summaries[0], String(selected.size));
    setText(summaries[1], `~${diagrams}`);
    setText(summaries[2], `~${Math.max(1, Math.ceil((selected.size * 2000 + diagrams * 3000) / 60000))} min`);
  };
  const filter = (): void => {
    const fragment = document.createDocumentFragment();
    const term = search.value.toLowerCase();
    for (const { row, searchText } of rows) {
      if (searchText.includes(term)) fragment.append(row);
    }
    list.replaceChildren(fragment);
  };
  search.addEventListener('input', filter, { signal });
  list.addEventListener('change', event => {
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement)) return;
    const path = checkbox.dataset.path;
    if (path === undefined) return;
    if (checkbox.checked) selected.add(path);
    else selected.delete(path);
    updateSelection();
  }, { signal });
  list.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      event.target.click();
    }
  }, { signal });
  bindAction(target, 'all', () => { selected = new Set(notes.map(note => note.path)); updateSelection(); }, signal);
  bindAction(target, 'none', () => { selected.clear(); updateSelection(); }, signal);
  bindAction(target, 'diagrams', () => {
    selected = new Set(notes.filter(note => note.estimatedDiagrams > 0).map(note => note.path));
    updateSelection();
  }, signal);
  bindAction(target, 'cancel', onCancel, signal);
  bindAction(target, 'export', () => {
    if (selected.size > 0) {
      onConfirm(notes.filter(note => selected.has(note.path)));
      return;
    }
    warning.hidden = false;
    clearTimeout(warningTimer);
    warningTimer = setTimeout(() => { warning.hidden = true; }, 3000);
  }, signal);
  filter();
  updateSelection();
  return { dispose: (): void => { events.abort(); clearTimeout(warningTimer); } };
}

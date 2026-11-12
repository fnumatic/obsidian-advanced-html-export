import type { NoteSelectionProps } from '../types';
import type { ModalView } from '../view';
import { bindAction, button, icon, setText, summaryStat } from '../view-helpers';

/** Builds the selector once and reuses its rows when filtering. */
export function createNoteSelectionView(target: HTMLElement, { notes, onConfirm, onCancel }: NoteSelectionProps): ModalView {
  const events = new AbortController();
  target.empty();
  const { signal } = events;
  let selected = new Set(notes.map(note => note.path));
  let warningTimer: number | undefined;

  const container = target.createDiv({ cls: 'flex flex-col', attr: { 'data-tags': 'ns-container' } });
  const header = container.createDiv({ cls: 'flex justify-between items-center mb-4', attr: { 'data-tags': 'ns-header' } });
  header.createEl('h2', { cls: 'm-0 text-obsidian font-semibold', text: 'Select notes' });
  const count = header.createSpan({
    cls: 'text-obsidian-sm text-obsidian-muted bg-obsidian-alt px-3 py-1 rounded-full',
    attr: { 'data-count': '' },
  });

  const searchArea = container.createEl('aside', { cls: 'mb-3', attr: { 'data-tags': 'ns-search' } });
  const search = searchArea.createEl('input', {
    cls: 'obsidian-input',
    attr: { type: 'search', placeholder: 'Search notes...', 'aria-label': 'Search notes' },
  });

  const actions = container.createEl('section', {
    cls: 'flex gap-2 pb-3 mb-3 border-b border-dimmed',
    attr: { 'data-tags': 'ns-actions' },
  });
  button(actions, 'Select all', 'all');
  button(actions, 'Select none', 'none');
  button(actions, 'With diagrams only', 'diagrams');

  const list = container.createEl('main', {
    cls: 'max-h-[400px] overflow-y-auto border-obsidian rounded p-2 flex-1',
    attr: { 'data-tags': 'ns-list', 'aria-label': 'Notes' },
  });
  const warning = container.createDiv({
    cls: 'my-3 p-2 rounded text-center text-obsidian-sm warning-bg',
    attr: { 'data-tags': 'ns-warning', role: 'alert' },
  });
  warning.hidden = true;
  setText(warning, 'Please select at least one note.');

  const summary = container.createEl('section', {
    cls: 'mt-4 p-3 bg-obsidian-alt rounded grid grid-cols-3 gap-3 text-center',
    attr: { 'data-tags': 'ns-summary' },
  });
  const summaries = [
    summaryStat(summary, '', 'selected'),
    summaryStat(summary, '', 'diagrams'),
    summaryStat(summary, '', 'estimated time'),
  ];

  const footer = container.createEl('footer', {
    cls: 'flex justify-end gap-3 mt-5 pt-4 border-t border-dimmed',
    attr: { 'data-tags': 'ns-footer' },
  });
  button(footer, 'Cancel', 'cancel');
  button(footer, 'Export', 'export', 'obsidian-btn-primary mod-cta');

  const rows = [...notes].sort((a, b) => b.estimatedDiagrams - a.estimatedDiagrams).map(note => {
    const row = list.createEl('label', { cls: 'note-list-item cursor-pointer' });
    const checkbox = row.createEl('input', {
      cls: 'w-4 h-4 cursor-pointer',
      attr: { type: 'checkbox', 'aria-label': `Select ${note.title}` },
    });
    checkbox.dataset.path = note.path;
    const body = row.createDiv({ cls: 'flex-1 min-w-0' });
    body.createDiv({ cls: 'whitespace-nowrap overflow-hidden text-ellipsis', text: note.title });
    body.createDiv({ cls: 'text-obsidian-muted whitespace-nowrap overflow-hidden text-ellipsis', text: note.path });
    const stats = row.createSpan({ cls: 'text-obsidian-muted' });
    if (note.estimatedDiagrams > 0) {
      icon(stats, 'chart-bar');
      stats.append(String(note.estimatedDiagrams));
    }
    icon(stats, 'link');
    stats.append(String(note.linkCount));
    return { note, row, checkbox, searchText: `${note.title}\n${note.path}`.toLowerCase() };
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
    const term = search.value.toLowerCase();
    list.replaceChildren(...rows.filter(({ searchText }) => searchText.includes(term)).map(({ row }) => row));
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
    window.clearTimeout(warningTimer);
    warningTimer = window.setTimeout(() => { warning.hidden = true; }, 3000);
  }, signal);
  filter();
  updateSelection();
  return { dispose: (): void => { events.abort(); window.clearTimeout(warningTimer); } };
}

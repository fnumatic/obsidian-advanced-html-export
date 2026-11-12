import { createNoteSelectionView as NoteSelection } from '../../src/ui/views/note-selection-view';
import { createRenderingProgressView as RenderingProgress } from '../../src/ui/views/rendering-progress-view';
import { createExportPreviewView as ExportPreview } from '../../src/ui/views/export-preview-view';
import { createExportStatisticsView as ExportStatistics } from '../../src/ui/views/export-statistics-view';
import type { ModalView } from '../../src/ui/view';
import type { ExportMetrics, NoteInfo } from '../../src/utils/wikiExportOrchestrator';
import type { RenderEvent } from '../../src/utils/detailedRenderer';
import type { ExportSizeReport } from '../../src/utils/exportSizeReport';
import { CancellationToken } from '../../src/utils/cancellationToken';
import { PauseController } from '../../src/utils/pauseController';
import 'virtual:uno.css';
import '../../src/styles.css';
import '../../src/ui/styles/plugin-styles.css';
import './bench.css';

const target = document.createElement('div');
target.className = 'advanced-html-export-modal benchmark-target';
document.body.append(target);
const assert = (value: unknown, message: string): void => { if (!value) throw new Error(message); };
const settle = (): void => { target.getBoundingClientRect(); };
function mount<P, V extends ModalView>(create: (target: HTMLElement, props: P) => V, options: { target: HTMLElement; props: P }): V {
  return create(options.target, options.props);
}
const unmount = (view: ModalView): void => view.dispose();
const notesFor = (count: number): NoteInfo[] => Array.from({ length: count }, (_, index) => ({
  title: `Note ${String(index).padStart(5, '0')} <safe>`, path: `folder/note-${index}.md`,
  estimatedDiagrams: index % 4, linkCount: index % 8, codeBlockCount: index % 3,
} as NoteInfo));
const metricsFor = (count: number): ExportMetrics => ({ totalNotes: count, estimatedDiagrams: count, totalCodeBlocks: count } as ExportMetrics);
const click = (text: string): void => {
  const node = [...target.querySelectorAll('button')].find(item => item.textContent?.includes(text));
  assert(node, `Missing button: ${text}`);
  node!.click(); settle();
};
const time = (fn: () => void): number => { const start = performance.now(); fn(); settle(); return performance.now() - start; };

async function selection(count: number): Promise<Record<string, number>> {
  const notes = notesFor(count);
  let selected: NoteInfo[] | null = null;
  let cancelled = false;
  let view: ModalView;
  const mountMs = time(() => { view = mount(NoteSelection, { target, props: { notes, onConfirm: (result: NoteInfo[]) => { selected = result; }, onCancel: () => { cancelled = true; } } }); });
  assert(target.querySelectorAll('.note-list-item').length === count, 'Initial selection rows');
  assert(target.querySelectorAll('input:checked').length === count, 'Initial selection');
  assert(!target.querySelector('safe'), 'HTML injection');
  assert(getComputedStyle(target.querySelector('[data-tags="ns-list"]')!).maxHeight === '400px', 'List height CSS parity');
  assert(getComputedStyle(target.querySelector('[data-tags="ns-summary"]')!).display === 'grid', 'Summary CSS parity');
  assert(getComputedStyle(target.querySelector('.note-list-item')!).display === 'flex', 'Row CSS parity');
  const domNodes = target.querySelectorAll('*').length;
  const noneMs = time(() => click('Select none'));
  assert(target.querySelectorAll('input:checked').length === 0, 'Select none');
  click('Export');
  assert(target.querySelector<HTMLElement>('[data-tags="ns-warning"]')?.hidden === false, 'Empty selection warning');
  assert(selected === null, 'Empty export blocked');
  const allMs = time(() => click('Select all'));
  assert(target.querySelectorAll('input:checked').length === count, 'Select all');
  click('With diagrams only');
  assert(target.querySelectorAll('input:checked').length === notes.filter(note => note.estimatedDiagrams > 0).length, 'Diagrams selection');
  const input = target.querySelector<HTMLInputElement>('[placeholder="Search notes..."]')!;
  const searchMs = time(() => { input.value = '0000'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  const expected = notes.filter(note => note.title.toLowerCase().includes('0000') || note.path.includes('0000'));
  assert(target.querySelectorAll('.note-list-item').length === expected.length, 'Search results');
  input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); settle();
  const checkbox = target.querySelector<HTMLInputElement>('.note-list-item input')!;
  const before = checkbox.checked;
  const toggleMs = time(() => checkbox.click());
  assert(checkbox.checked !== before, 'Checkbox toggle');
  checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); settle();
  assert(checkbox.checked === before, 'Keyboard toggle');
  click('Export');
  assert(selected !== null, 'Confirm selected notes');
  click('Cancel'); assert(cancelled, 'Cancel selection');
  const unmountStart = performance.now();
  await unmount(view!); target.replaceChildren(); settle();
  return { mountMs, noneMs, allMs, searchMs, toggleMs, unmountMs: performance.now() - unmountStart, domNodes };
}

async function progress(count: number): Promise<Record<string, number>> {
  const token = new CancellationToken();
  const pauseController = new PauseController();
  const view = mount(RenderingProgress, { target, props: { metrics: metricsFor(count + 1), token, pauseController, onComplete: () => {}, onCancel: () => {} } });
  settle();
  const event = (type: RenderEvent['type'], index: number): RenderEvent => ({ type, noteTitle: `Note ${index}`, notePath: `note-${index}.md`, timestamp: Date.now(), details: { totalDiagrams: 1, totalCodeBlocks: 1, totalImages: 1, duration: 100, linkCount: 2, total: 1 } });
  click('Pause');
  assert(target.textContent?.includes('Resume'), 'Pause button');
  assert(pauseController.isPaused, 'Pause controller');
  click('Resume');
  assert(!pauseController.isPaused, 'Resume controller');
  const start = performance.now();
  for (let index = 0; index < count; index++) {
    for (const type of ['note_start', 'diagram_complete', 'codeblock_complete', 'image_complete', 'note_complete'] as const) {
      view.handleEvent(event(type, index));
      // Keep the per-event layout boundary used by the archived comparison.
      settle();
    }
  }
  const eventsMs = performance.now() - start;
  assert(target.querySelectorAll('[data-tags="rp-completed"] .note-list-item').length === count, 'Completed rows');
  assert(target.querySelector('[data-tags="rp-completed"] summary')?.textContent?.includes(`(${count})`), 'Completed count');
  const domNodes = target.querySelectorAll('*').length;
  click('Cancel export');
  assert(token.isCancelled, 'Cancellation token');
  await unmount(view); target.replaceChildren(); settle();
  return { eventsMs, eventCount: count * 5, domNodes };
}

async function staticViews(): Promise<void> {
  let choice = '';
  const preview = mount(ExportPreview, { target, props: { metrics: metricsFor(10), notes: notesFor(10), onAction: (value: string) => { choice = value; } } });
  settle();
  assert(target.querySelectorAll('.note-list-item').length === 10, 'Preview rows');
  for (const [label, value] of [['Select notes', 'selectNotes'], ['Export all', 'exportAll'], ['Cancel', 'cancel']]) { click(label); assert(choice === value, `Preview ${label}`); }
  await unmount(preview); target.replaceChildren();
  const report: ExportSizeReport = {
    rawBytes: 20000, outputBytes: 10000, categories: [{ key: 'images', bytes: 20000, share: 1 }],
    imageFormats: [{ format: 'webp', bytes: 20000, count: 1 }],
    vaultNoteBytes: 1000, vaultImageBytes: 20000, vaultOriginalBytes: 21000,
    embeddedImageBytes: 20000, imageReferences: 2, uniqueImages: 1,
    deduplicationSavingBytes: 20000, noteCount: 10,
    largestArtifacts: [{ kind: 'image', original: '<img src=x onerror=alert(1)>', exportType: 'webp', bytes: 20000 }],
  };
  let closed = false;
  const statistics = mount(ExportStatistics, { target, props: { report, onClose: () => { closed = true; } } });
  settle();
  assert(target.querySelector('[data-tags="es-output"]')?.textContent === '9.8 KB', 'Statistics size');
  assert(target.querySelectorAll('[data-tags="es-category"]').length === 1, 'Statistics category');
  assert(target.querySelector('[data-tags="es-artifact-original"]')?.textContent === report.largestArtifacts[0].original, 'Escaped artifact');
  assert(!target.querySelector('img'), 'Artifact HTML injection');
  click('Close'); assert(closed, 'Close statistics');
  await unmount(statistics); target.replaceChildren();
}

function retainSelection(count: number): void {
  mount(NoteSelection, { target, props: { notes: notesFor(count), onConfirm: () => {}, onCancel: () => {} } });
  settle();
}

declare global { interface Window { benchmark: { selection: typeof selection; progress: typeof progress; staticViews: typeof staticViews; retainSelection: typeof retainSelection } } }
window.benchmark = { selection, progress, staticViews, retainSelection };

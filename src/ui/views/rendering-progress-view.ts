import type { RenderEvent } from '../../utils/detailedRenderer';
import type { RenderingProgressProps } from '../types';
import type { ModalView } from '../view';
import { formatDuration, truncateTitle } from '../../utils/renderProgress';
import { RenderingProgressStore } from '../rendering-progress-store';
import { bindAction, button, element, icon, noteStats, setText } from '../view-helpers';
import { bindProgressBar, progressBar } from '../components/progress-bar';
import { bindDetailRow, detailRow } from '../components/detail-row';

export interface RenderingProgressView extends ModalView {
  handleEvent(event: RenderEvent): void;
  complete(): void;
}

/** Keeps stable DOM references and appends each completed note exactly once. */
export function createRenderingProgressView(target: HTMLElement, props: RenderingProgressProps): RenderingProgressView {
  const events = new AbortController();
  target.empty();
  const container = target.createDiv({ cls: 'p-0', attr: { 'data-tags': 'rp-container' } });
  container.createEl('header', {
    cls: 'mt-0 mb-4 text-obsidian font-semibold',
    text: 'Rendering wiki export',
    attr: { 'data-tags': 'rp-header' },
  });

  const detailsEl = container.createEl('details', { cls: 'mb-3', attr: { 'data-tags': 'rp-completed' } });
  detailsEl.open = true;
  const summary = detailsEl.createEl('summary', {
    cls: 'font-semibold text-obsidian cursor-pointer py-2',
    text: 'Completed notes (0)',
  });
  const completed = detailsEl.createDiv({
    cls: 'min-h-[114px] max-h-[114px] overflow-y-auto border border-obsidian rounded p-1.5 mt-2',
    attr: { 'data-completed-list': '' },
  });

  const current = container.createEl('section', {
    cls: 'mt-3 p-2.5 bg-obsidian-alt rounded',
    attr: { 'data-tags': 'rp-current' },
  });
  const title = current.createDiv({
    cls: 'font-semibold text-obsidian mb-2 whitespace-nowrap overflow-hidden text-ellipsis',
    attr: { 'data-current-title': '' },
  });
  const phase = current.createDiv({
    cls: 'text-obsidian-xs text-obsidian-muted mb-2 h-4 whitespace-nowrap overflow-hidden text-ellipsis',
    attr: { 'data-phase': '' },
  });
  progressBar(current);
  const detailList = current.createDiv({ cls: 'flex flex-col gap-1.5 mt-2' });
  detailRow(detailList, 'chart-bar', 'Diagrams');
  detailRow(detailList, 'code-block', 'Code blocks');
  detailRow(detailList, 'image', 'images');
  const warning = current.createDiv({
    cls: 'mt-2 p-1.5 rounded text-obsidian-sm warning-bg h-[28px]',
    attr: { 'data-warning': '', role: 'status' },
  });

  const timeStats = container.createDiv({
    cls: 'mt-2.5 p-2 bg-obsidian-alt rounded flex justify-around text-obsidian-sm',
    attr: { 'data-tags': 'rp-time-stats' },
  });
  for (const [name, label] of [['timer', 'Elapsed'], ['hourglass', 'Remaining'], ['lightning', 'Speed']] as const) {
    const cell = timeStats.createDiv({ cls: 'flex flex-col items-center gap-1' });
    cell.createSpan({ cls: 'font-semibold', attr: { 'data-time': '' } });
    const caption = cell.createSpan({ cls: 'text-obsidian-xs text-obsidian-muted' });
    icon(caption, name, 'text-[1em]');
    caption.append(` ${label}`);
  }

  const footer = container.createEl('footer', {
    cls: 'mt-4 flex justify-between items-center gap-3',
    attr: { 'data-tags': 'rp-footer' },
  });
  const paused = footer.createDiv({ cls: 'font-semibold text-obsidian-sm', attr: { 'data-paused': '' } });
  icon(paused, 'pause', 'text-[1em]');
  paused.append(' PAUSED');
  const footerButtons = footer.createDiv({ cls: 'flex gap-3 ml-auto' });
  const pauseButton = button(footerButtons, 'Pause', 'pause');
  const cancelButton = button(footerButtons, 'Cancel export', 'cancel', 'obsidian-btn-danger');

  const overallFill = element(target, '[data-tags="rp-current"] > [data-tags="pb-container"] [data-tags="pb-fill"]');
  const updateBar = bindProgressBar(element(target, '[data-tags="rp-current"] > [data-tags="pb-container"]'));
  const times = [...target.querySelectorAll<HTMLElement>('[data-time]')];
  const detailBars = [...target.querySelectorAll<HTMLElement>('[data-tags="dr-container"]')].map(bindDetailRow);
  let displayed = 0;
  let previousPaused: boolean | undefined;
  const store = new RenderingProgressStore(props, () => update());

  function update(): void {
    setText(title, store.isCompleted ? '✅ Rendering complete!' : store.currentNote ?
      `Rendering ${store.currentNote.index + 1}/${props.metrics.totalNotes}: ${truncateTitle(store.currentNote.title, 40)}` : 'Preparing...');
    const running = !!store.currentNote && !store.isCancelled && !store.isCompleted;
    setText(phase, running ? `${store.currentNote?.phase ?? 'Working'} · ${formatDuration(store.noteElapsed)}` : '');
    phase.classList.toggle('rp-hidden', !running);
    overallFill.classList.toggle('progress-busy', running);
    updateBar(store.overallProgress);
    setText(summary, `Completed notes (${store.completedNotes.length})`);
    while (displayed < store.completedNotes.length) {
      const note = store.completedNotes[displayed++];
      const item = completed.createDiv({ cls: 'note-list-item' });
      item.createSpan({ cls: 'text-obsidian-muted shrink-0', text: '✓' });
      item.createSpan({
        cls: 'flex-1 ml-2 mr-4 max-w-[calc(100%-160px)] whitespace-nowrap overflow-hidden text-ellipsis text-left',
        text: truncateTitle(note.title, 60),
      });
      noteStats(item.createSpan({ cls: 'text-obsidian-muted shrink-0 whitespace-nowrap' }), [
        [(note.duration / 1000).toFixed(1), 'lightning'],
        [note.totalDiagrams, 'chart-bar'],
        [note.totalCodeBlocks, 'code-block'],
        [note.totalImages, 'image'],
        [note.linkCount, 'document'],
      ]);
    }
    (['diagrams', 'codeBlocks', 'images'] as const).forEach((key, index) => detailBars[index](store.currentNote?.[key]));
    setText(warning, store.warning || ' ');
    warning.classList.toggle('rp-hidden', !store.warning);
    paused.classList.toggle('rp-hidden', !store.isPaused);
    if (previousPaused !== store.isPaused) {
      pauseButton.empty();
      icon(pauseButton, store.isPaused ? 'play' : 'pause', 'text-[1em]');
      pauseButton.append(store.isPaused ? ' Resume' : ' Pause');
      previousPaused = store.isPaused;
    }
    pauseButton.disabled = store.isCompleted || store.isCancelled;
    cancelButton.disabled = store.isCompleted || store.isCancelled;
    [store.elapsedLabel, store.remainingLabel, store.speed].forEach((value, index) => setText(times[index], value));
  }
  bindAction(target, 'pause', () => store.togglePause(), events.signal);
  bindAction(target, 'cancel', () => store.cancel(), events.signal);
  update();
  store.start();
  return {
    handleEvent: (event: RenderEvent): void => store.handleEvent(event),
    complete: (): void => store.complete(),
    dispose: (): void => { events.abort(); store.dispose(); },
  };
}

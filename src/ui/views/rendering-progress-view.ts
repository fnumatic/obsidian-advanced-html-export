import type { RenderEvent } from '../../utils/detailedRenderer';
import type { RenderingProgressProps } from '../types';
import type { ModalView } from '../view';
import { escapeHtml } from '../../utils/htmlUtils';
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
  target.innerHTML = `<div data-tags="rp-container" class="p-0">
    <header data-tags="rp-header" class="mt-0 mb-4 text-obsidian font-semibold">Rendering wiki export</header>
    <details data-tags="rp-completed" open class="mb-3">
      <summary class="font-semibold text-obsidian cursor-pointer py-2">Completed notes (0)</summary>
      <div data-completed-list class="min-h-[114px] max-h-[114px] overflow-y-auto border border-obsidian rounded p-1.5 mt-2"></div>
    </details>
    <section data-tags="rp-current" class="mt-3 p-2.5 bg-obsidian-alt rounded">
      <div data-current-title class="font-semibold text-obsidian mb-2 whitespace-nowrap overflow-hidden text-ellipsis"></div>
      <div data-phase class="text-obsidian-xs text-obsidian-muted mb-2"></div>
      ${progressBar()}
      <div class="flex flex-col gap-1.5 mt-2">${detailRow('chart-bar', 'Diagrams')}${detailRow('code-block', 'Code blocks')}${detailRow('image', 'images')}</div>
      <div data-warning role="status" class="mt-2 p-1.5 rounded text-obsidian-sm warning-bg h-[28px]"></div>
    </section>
    <div data-tags="rp-time-stats" class="mt-2.5 p-2 bg-obsidian-alt rounded flex justify-around text-obsidian-sm">
      ${([['timer', 'Elapsed'], ['hourglass', 'Remaining'], ['lightning', 'Speed']] as const).map(([name, label]) => `<div class="flex flex-col items-center gap-1"><span data-time class="font-semibold"></span><span class="text-obsidian-xs text-obsidian-muted">${icon(name, '1em')} ${label}</span></div>`).join('')}
    </div>
    <footer data-tags="rp-footer" class="mt-4 flex justify-between items-center gap-3">
      <div data-paused class="font-semibold text-obsidian-sm">${icon('pause', '1em')} PAUSED</div>
      <div class="flex gap-3 ml-auto">${button('Pause', 'pause')}${button('Cancel export', 'cancel', 'obsidian-btn-danger')}</div>
    </footer>
  </div>`;
  const title = element(target, '[data-current-title]');
  const phase = element(target, '[data-phase]');
  const overallFill = element(target, '[data-tags="rp-current"] > [data-tags="pb-container"] [data-tags="pb-fill"]');
  const completed = element(target, '[data-completed-list]');
  const summary = element(target, 'summary');
  const updateBar = bindProgressBar(element(target, '[data-tags="rp-current"] > [data-tags="pb-container"]'));
  const warning = element(target, '[data-warning]');
  const paused = element(target, '[data-paused]');
  const pauseButton = element<HTMLButtonElement>(target, '[data-action="pause"]');
  const cancelButton = element<HTMLButtonElement>(target, '[data-action="cancel"]');
  const times = [...target.querySelectorAll<HTMLElement>('[data-time]')];
  const details = [...target.querySelectorAll<HTMLElement>('[data-tags="dr-container"]')].map(bindDetailRow);
  let displayed = 0;
  let previousPaused: boolean | undefined;
  const store = new RenderingProgressStore(props, () => update());

  function update(): void {
    setText(title, store.isCompleted ? '✅ Rendering complete!' : store.currentNote ?
      `Rendering ${store.currentNote.index + 1}/${props.metrics.totalNotes}: ${truncateTitle(store.currentNote.title, 40)}` : 'Preparing...');
    const running = !!store.currentNote && !store.isCancelled && !store.isCompleted;
    setText(phase, running ? `${store.currentNote?.phase ?? 'Working'} · ${formatDuration(store.noteElapsed)}` : '');
    phase.style.visibility = running ? 'visible' : 'hidden';
    overallFill.classList.toggle('progress-busy', running);
    updateBar(store.overallProgress);
    setText(summary, `Completed notes (${store.completedNotes.length})`);
    while (displayed < store.completedNotes.length) {
      const note = store.completedNotes[displayed++];
      completed.insertAdjacentHTML('beforeend', `<div class="note-list-item">
        <span class="text-obsidian-muted shrink-0">✓</span>
        <span class="flex-1 ml-2 mr-4 max-w-[calc(100%-160px)] whitespace-nowrap overflow-hidden text-ellipsis text-left">${escapeHtml(truncateTitle(note.title, 60))}</span>
        <span class="text-obsidian-muted shrink-0 whitespace-nowrap">${noteStats([[(note.duration / 1000).toFixed(1), 'lightning'], [note.totalDiagrams, 'chart-bar'], [note.totalCodeBlocks, 'code-block'], [note.totalImages, 'image'], [note.linkCount, 'document']])}</span>
      </div>`);
    }
    (['diagrams', 'codeBlocks', 'images'] as const).forEach((key, index) => details[index](store.currentNote?.[key]));
    setText(warning, store.warning || ' ');
    warning.style.visibility = store.warning ? 'visible' : 'hidden';
    paused.style.visibility = store.isPaused ? 'visible' : 'hidden';
    if (previousPaused !== store.isPaused) {
      pauseButton.innerHTML = `${icon(store.isPaused ? 'play' : 'pause', '1em')} ${store.isPaused ? 'Resume' : 'Pause'}`;
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

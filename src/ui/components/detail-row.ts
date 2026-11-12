import type { CurrentNoteProgress, DetailItem } from '../types';
import { element, icon, setText, type IconName } from '../view-helpers';
import { progressBar, bindProgressBar } from './progress-bar';

/** Appends one detail row and returns its root. */
export function detailRow(parent: HTMLElement, name: IconName, label: string): HTMLElement {
  const root = parent.createDiv({ cls: 'flex flex-col gap-0.5 text-obsidian-sm', attr: { 'data-tags': 'dr-container' } });
  const main = root.createDiv({ cls: 'flex items-center gap-2', attr: { 'data-tags': 'dr-main' } });
  icon(main.createSpan({ cls: 'w-5 text-center text-obsidian' }), name);
  main.createSpan({ cls: 'whitespace-nowrap text-obsidian-muted', text: label });
  progressBar(main.createDiv({ cls: 'flex-1' }), true);
  main.createSpan({
    cls: 'whitespace-nowrap text-obsidian-muted tabular-nums min-w-[50px] text-right',
    attr: { 'data-tags': 'dr-progress' },
  });
  root.createDiv({
    cls: 'text-obsidian-xs text-obsidian-muted pl-7 min-h-4 whitespace-nowrap overflow-hidden text-ellipsis',
    attr: { 'data-tags': 'dr-status' },
  });
  return root;
}

export function bindDetailRow(root: HTMLElement): (item: DetailItem | undefined) => void {
  const updateBar = bindProgressBar(element(root, '[data-tags="pb-container"]'));
  const progress = element(root, '[data-tags="dr-progress"]');
  const status = element(root, '[data-tags="dr-status"]');
  return (item: CurrentNoteProgress['images'] | undefined): void => {
    const total = item?.total ?? 0;
    const processed = item?.processed ?? 0;
    updateBar(total > 0 ? processed / total * 100 : 0);
    setText(progress, `${processed}/${total}`);
    const phase = item?.currentPhase;
    setText(status, !item ? 'Waiting...' : total === 0 ? 'None' : phase ?
      `${phase.charAt(0).toUpperCase()}${phase.slice(1)}: ${item.currentFileName ?? ''}` : 'Processing...');
  };
}

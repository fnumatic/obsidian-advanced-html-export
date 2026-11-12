import type { CurrentNoteProgress } from '../types';
import { element, icon, setText, type IconName } from '../view-helpers';
import { progressBar, bindProgressBar } from './progress-bar';

export function detailRow(name: IconName, label: string): string {
  return `<div data-tags="dr-container" class="flex flex-col gap-0.5 text-obsidian-sm"><div data-tags="dr-main" class="flex items-center gap-2"><span class="w-5 text-center text-obsidian">${icon(name)}</span><span class="whitespace-nowrap text-obsidian-muted">${label}</span><div class="flex-1">${progressBar(true)}</div><span data-tags="dr-progress" class="whitespace-nowrap text-obsidian-muted tabular-nums min-w-[50px] text-right"></span></div><div data-tags="dr-status" class="text-obsidian-xs text-obsidian-muted pl-7 min-h-4 whitespace-nowrap overflow-hidden text-ellipsis"></div></div>`;
}

export function bindDetailRow(root: HTMLElement): (item: CurrentNoteProgress['images'] | undefined) => void {
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

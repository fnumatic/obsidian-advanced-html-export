import { element, setText } from '../view-helpers';

/** Shared markup for overall progress and the small detail bars. */
export function progressBar(small = false): string {
  return `<div data-tags="pb-container" role="progressbar" aria-label="${small ? 'Item progress' : 'Overall progress'}" aria-valuemin="0" aria-valuemax="100" class="overflow-hidden bg-obsidian ${small ? 'rounded h-1.5 opacity-40' : 'rounded-full h-4 relative'}"><div data-tags="pb-fill" class="h-full rounded-full progress-gradient"></div>${small ? '' : '<span data-tags="pb-text" class="absolute inset-0 flex items-center justify-center text-obsidian-xs font-semibold text-white" style="text-shadow:0 1px 2px rgba(0,0,0,0.3)"></span>'}</div>`;
}

/** Binds once; subsequent updates only touch the bar's dynamic properties. */
export function bindProgressBar(root: HTMLElement): (progress: number) => void {
  const fill = element(root, '[data-tags="pb-fill"]');
  const text = root.querySelector<HTMLElement>('[data-tags="pb-text"]');
  return (progress: number): void => {
    const value = Math.min(100, Math.max(0, progress));
    fill.style.width = `${value}%`;
    fill.classList.toggle('transition-all', value > 0 && value < 100);
    fill.classList.toggle('duration-300', value > 0 && value < 100);
    fill.classList.toggle('opacity-0', value === 0);
    root.setAttribute('aria-valuenow', String(Math.round(value)));
    if (text) setText(text, `${Math.round(value)}%`);
  };
}

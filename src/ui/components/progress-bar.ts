import { element, setText } from '../view-helpers';

/**
 * Appends a progress bar and returns its root.
 * @param small True for the compact per-item bar without a percentage label
 */
export function progressBar(parent: HTMLElement, small = false): HTMLElement {
  const root = parent.createDiv({
    cls: `overflow-hidden bg-obsidian ${small ? 'rounded h-1.5 opacity-40' : 'rounded-full h-4 relative'}`,
    attr: {
      'data-tags': 'pb-container',
      role: 'progressbar',
      'aria-label': small ? 'Item progress' : 'Overall progress',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
    },
  });
  root.createDiv({ cls: 'h-full rounded-full progress-gradient', attr: { 'data-tags': 'pb-fill' } });
  if (!small) {
    root.createSpan({
      cls: 'absolute inset-0 flex items-center justify-center text-obsidian-xs font-semibold text-white progress-text',
      attr: { 'data-tags': 'pb-text' },
    });
  }
  return root;
}

/** Binds once; subsequent updates only touch the bar's dynamic properties. */
export function bindProgressBar(root: HTMLElement): (progress: number) => void {
  const fill = element(root, '[data-tags="pb-fill"]');
  const text = root.querySelector<HTMLElement>('[data-tags="pb-text"]');
  return (progress: number): void => {
    const value = Math.min(100, Math.max(0, progress));
    fill.setCssProps({ '--pb-value': `${value}%` });
    fill.classList.toggle('transition-all', value > 0 && value < 100);
    fill.classList.toggle('duration-300', value > 0 && value < 100);
    fill.classList.toggle('opacity-0', value === 0);
    root.setAttribute('aria-valuenow', String(Math.round(value)));
    if (text) setText(text, `${Math.round(value)}%`);
  };
}

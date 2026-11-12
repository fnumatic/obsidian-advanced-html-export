import { escapeHtml } from '../utils/htmlUtils';

export type IconName = 'chart-bar' | 'code-block' | 'document' | 'hourglass' |
  'image' | 'lightning' | 'link' | 'pause' | 'play' | 'timer';

/** Looks up a required element in an internally constructed template. */
export function element<T extends HTMLElement = HTMLElement>(root: HTMLElement, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing view element: ${selector}`);
  return found;
}

/** Updates only changed text, retaining the surrounding DOM. */
export function setText(target: HTMLElement, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}

export function icon(name: IconName, size?: string): string {
  return `<span class="i-carbon-${name}" aria-hidden="true"${size ? ` style="font-size:${escapeHtml(size)}"` : ''}></span>`;
}

export function button(label: string, name: string, className = 'obsidian-btn'): string {
  return `<button type="button" class="${escapeHtml(className)}" data-action="${escapeHtml(name)}">${escapeHtml(label)}</button>`;
}

export function bindAction(root: HTMLElement, name: string, callback: () => void, signal: AbortSignal): HTMLButtonElement {
  const control = element<HTMLButtonElement>(root, `[data-action="${name}"]`);
  control.addEventListener('click', callback, { signal });
  return control;
}

export function noteStats(values: Array<[number | string, IconName]>): string {
  return `<div class="note-list-stats">${values.map(([value, name]) =>
    `<span class="note-list-stat"><span class="note-list-stat-number">${escapeHtml(String(value))}</span>${icon(name)}</span>`).join('')}</div>`;
}

export function summaryStat(value: number | string, label: string): string {
  return `<div class="flex flex-col items-center gap-1"><span data-stat-value class="font-semibold">${escapeHtml(String(value))}</span><span class="text-obsidian-xs text-obsidian-muted">${escapeHtml(label)}</span></div>`;
}

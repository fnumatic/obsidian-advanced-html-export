import { escapeHtml } from '../utils/htmlUtils';

export type IconName = 'chart-bar' | 'code-block' | 'document' | 'hourglass' |
  'image' | 'lightning' | 'link' | 'pause' | 'play' | 'timer';

/** Markup that is already escaped and safe to insert into a view. */
export class SafeHtml {
  constructor(readonly value: string) {}
}

/** Marks markup produced by a trusted builder, such as the helpers below. */
export const raw = (markup: string): SafeHtml => new SafeHtml(markup);

const render = (value: unknown): string => value instanceof SafeHtml ? value.value :
  Array.isArray(value) ? value.map(render).join('') : escapeHtml(String(value));

/**
 * @security The views need the class-heavy markup that UnoCSS generates, so
 * their markup lives in strings and reaches the DOM through innerHTML. This
 * template escapes every interpolation, and only raw()/SafeHtml bypasses that,
 * so user text such as note titles or paths cannot become HTML.
 */
export const html = (strings: TemplateStringsArray, ...values: unknown[]): SafeHtml =>
  raw(strings.reduce((out, part, index) => out + part + (index < values.length ? render(values[index]) : ''), ''));

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

export function icon(name: IconName, size?: string): SafeHtml {
  return html`<span class="i-carbon-${name}" aria-hidden="true"${size ? html` style="font-size:${size}"` : ''}></span>`;
}

export function button(label: string, name: string, className = 'obsidian-btn'): SafeHtml {
  return html`<button type="button" class="${className}" data-action="${name}">${label}</button>`;
}

export function bindAction(root: HTMLElement, name: string, callback: () => void, signal: AbortSignal): HTMLButtonElement {
  const control = element<HTMLButtonElement>(root, `[data-action="${name}"]`);
  control.addEventListener('click', callback, { signal });
  return control;
}

export function noteStats(values: Array<[number | string, IconName]>): SafeHtml {
  return html`<div class="note-list-stats">${values.map(([value, name]) =>
    html`<span class="note-list-stat"><span class="note-list-stat-number">${value}</span>${icon(name)}</span>`)}</div>`;
}

export function summaryStat(value: number | string, label: string): SafeHtml {
  return html`<div class="flex flex-col items-center gap-1"><span data-stat-value class="font-semibold">${value}</span><span class="text-obsidian-xs text-obsidian-muted">${label}</span></div>`;
}

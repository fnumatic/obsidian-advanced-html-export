export type IconName = 'chart-bar' | 'code-block' | 'document' | 'hourglass' |
  'image' | 'lightning' | 'link' | 'pause' | 'play' | 'timer';

/** Looks up a required element in an internally constructed view. */
export function element<T extends HTMLElement = HTMLElement>(root: HTMLElement, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing view element: ${selector}`);
  return found;
}

/** Updates only changed text, retaining the surrounding DOM. */
export function setText(target: HTMLElement, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}

/** Appends an UnoCSS icon span, optionally with extra classes such as a text size. */
export function icon(parent: HTMLElement, name: IconName, className = ''): HTMLElement {
  const span = parent.createSpan({ cls: `i-carbon-${name}${className ? ` ${className}` : ''}` });
  span.setAttribute('aria-hidden', 'true');
  return span;
}

/** Appends a view button that bindAction() can look up by name. */
export function button(parent: HTMLElement, label: string, name: string, className = 'obsidian-btn'): HTMLButtonElement {
  return parent.createEl('button', {
    cls: className,
    text: label,
    attr: { type: 'button', 'data-action': name },
  });
}

export function bindAction(root: HTMLElement, name: string, callback: () => void, signal: AbortSignal): HTMLButtonElement {
  const control = element<HTMLButtonElement>(root, `[data-action="${name}"]`);
  control.addEventListener('click', callback, { signal });
  return control;
}

/** Appends the compact number/icon row used for note statistics. */
export function noteStats(parent: HTMLElement, values: Array<[number | string, IconName]>): HTMLElement {
  const root = parent.createDiv({ cls: 'note-list-stats' });
  for (const [value, name] of values) {
    const stat = root.createSpan({ cls: 'note-list-stat' });
    stat.createSpan({ cls: 'note-list-stat-number', text: String(value) });
    icon(stat, name);
  }
  return root;
}

/** Appends one summary cell and returns the span that shows its value. */
export function summaryStat(parent: HTMLElement, value: number | string, label: string): HTMLElement {
  const cell = parent.createDiv({ cls: 'flex flex-col items-center gap-1' });
  const valueEl = cell.createSpan({ cls: 'font-semibold', attr: { 'data-stat-value': '' } });
  setText(valueEl, String(value));
  cell.createSpan({ cls: 'text-obsidian-xs text-obsidian-muted', text: label });
  return valueEl;
}

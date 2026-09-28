/**
 * Pure helpers for measuring and labelling export size artifacts.
 *
 * Kept free of Obsidian and the DOM APIs beyond the read-only `Element`
 * accessors they need, so the label/source resolution can be unit tested in
 * isolation from the renderer.
 */

import { lastPathSegment } from './pathUtils';

/**
 * Recognized diagram containers rendered by Obsidian or its diagram plugins.
 * The list is intentionally conservative: unmatched third-party renderers are
 * counted as note markup instead of being attributed incorrectly.
 */
export const DIAGRAM_SELECTOR = [
  '.mermaid',
  '.block-language-mermaid',
  '.block-language-plantuml',
  '.block-language-graph',
  '.excalidraw',
  'svg.excalidraw-svg',
].join(',');

/** Derives a short format name from an embedded data URI. */
export function formatFromDataUri(dataUri: string): string {
  const match = dataUri.match(/^data:([^;,]+)/);
  if (!match) return 'unknown';
  return match[1].replace(/^image\//, '').replace(/\+xml$/, '');
}

/** Derives a display label for an image source path. */
export function imageLabelFromPath(imagePath: string): string {
  if (imagePath.startsWith('data:')) return 'embedded image';
  if (imagePath.startsWith('blob:')) return 'embedded asset';
  const name = lastPathSegment(imagePath);
  try {
    return decodeURIComponent(name) || 'image';
  } catch {
    return name || 'image';
  }
}

/** Derives a diagram type label from a container's class list. */
export function diagramLabelFromNode(node: Element): string {
  const className = node.getAttribute?.('class') ?? '';
  if (className.includes('mermaid')) return 'Mermaid';
  if (className.includes('plantuml')) return 'PlantUML';
  if (className.includes('excalidraw')) return 'Excalidraw';
  if (className.includes('graph')) return 'Graph';
  return 'Diagram';
}

/** Derives a language label from a code block element. */
export function codeLabelFromNode(node: Element): string {
  const code = node.querySelector?.('code');
  const className = code?.getAttribute?.('class') ?? '';
  const match = className.match(/language-([\w-]+)/);
  return match ? match[1] : 'Code';
}

/** Derives a readable note label from a source path. */
export function noteLabelFromPath(sourcePath: string | undefined): string | undefined {
  if (!sourcePath || sourcePath === '.') return undefined;
  const file = lastPathSegment(sourcePath);
  const base = file.replace(/\.[^.]+$/, '');
  return base || undefined;
}

const EMBED_PATTERN = /!\[\[([^\]]+?)\]\]/g;
const DIAGRAM_SOURCE_PATTERN = /\.excalidraw$/i;

/**
 * Extracts the file names of embedded diagram source files (currently
 * `.excalidraw` embeds) from raw note markdown, in document order.
 * @param markdown Raw note markdown
 * @returns Embedded diagram file names
 */
export function extractDiagramSources(markdown: string): string[] {
  const sources: string[] = [];
  for (const match of markdown.matchAll(EMBED_PATTERN)) {
    const target = match[1].split('|')[0].split('#')[0].split('^')[0].trim();
    if (DIAGRAM_SOURCE_PATTERN.test(target)) {
      sources.push(target.split('/').pop() ?? target);
    }
  }
  return sources;
}

/**
 * Tries to read the embedded source path (e.g. a linked `.excalidraw` file)
 * from a diagram container or one of its descendants, if exposed in the DOM.
 */
export function diagramSourceFromNode(node: Element): string | undefined {
  const attributes = ['data-path', 'data-src', 'data-href', 'data-file'];
  const candidates: Element[] = [node];
  const selector = attributes.map((attr) => `[${attr}]`).join(',');
  node.querySelectorAll?.(selector)?.forEach((child) => candidates.push(child));
  for (const candidate of candidates) {
    for (const attribute of attributes) {
      const value = candidate.getAttribute?.(attribute);
      if (value) return value;
    }
  }
  return undefined;
}

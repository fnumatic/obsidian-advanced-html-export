/**
 * Remote images make Obsidian's MarkdownRenderer wait for their network
 * responses (up to the render timeout) before the note is considered rendered.
 * The exporter never embeds `http(s)` images, so that wait only delays the
 * export. The destinations are swapped for a transparent pixel before rendering
 * and restored afterwards, keeping the exported markup unchanged.
 */

const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const MARKER = '__advanced_export_remote_';

export interface RemoteImage {
  url: string;
  alt: string;
}

/**
 * Replaces remote image destinations outside fenced code blocks.
 * @param markdown Resolved markdown of one note
 * @returns Markdown safe to render plus the original images in document order
 */
export function blankRemoteImages(markdown: string): { markdown: string; images: RemoteImage[] } {
  const images: RemoteImage[] = [];
  const parts = markdown.split(/(^```[\s\S]*?^```|^~~~[\s\S]*?^~~~)/m);
  const text = parts.map((part, index) => {
    // Odd indices are the captured fenced blocks.
    if (index % 2 === 1) return part;
    return part.replace(
      /!\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+)(\s+"[^"]*")?\s*\)/g,
      (_match, alt: string, url: string, title: string | undefined) => {
        const marker = `${MARKER}${images.length}__`;
        images.push({ url, alt });
        return `![${marker}](${TRANSPARENT_PIXEL}${title ?? ''})`;
      },
    );
  });
  return { markdown: text.join(''), images };
}

/**
 * Restores the original sources of blanked images in a rendered element.
 * @param el Element produced by MarkdownRenderer
 * @param images Result of {@link blankRemoteImages}
 * @returns Number of restored images
 */
export function restoreRemoteImages(el: Element, images: RemoteImage[]): number {
  if (images.length === 0) return 0;
  let restored = 0;
  for (const img of el.querySelectorAll<HTMLImageElement>('img')) {
    const match = img.getAttribute('alt')?.match(/^__advanced_export_remote_(\d+)__$/);
    if (!match) continue;
    const original = images[Number(match[1])];
    if (!original) continue;
    img.setAttribute('src', original.url);
    if (original.alt) img.setAttribute('alt', original.alt);
    else img.removeAttribute('alt');
    restored += 1;
  }
  return restored;
}

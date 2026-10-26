import { TFile } from 'obsidian';

/**
 * Adds the Obsidian `HTMLElement.createDiv()` helper used by the renderers to
 * the DOM provided by the test environment (happy-dom / jsdom).
 */
export function installObsidianDom(): void {
  if (typeof HTMLElement === 'undefined') return;
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  if (typeof proto.createDiv !== 'function') {
    proto.createDiv = function (this: HTMLElement, opts?: { cls?: string; text?: string }) {
      const el = this.ownerDocument.createElement('div');
      if (opts?.cls) el.className = opts.cls;
      if (opts?.text !== undefined) el.textContent = opts.text;
      this.appendChild(el);
      return el;
    };
  }
}

/**
 * Installs a minimal `document` mock on `globalThis` for tests that only need
 * `document.body.createDiv()` to exist (renderers called outside a real DOM).
 */
export function installMockDocument(): void {
  const body = {
    createDiv: () => ({ innerHTML: '', querySelectorAll: () => [], setAttribute: () => {} }),
  };
  Object.defineProperty(globalThis, 'document', {
    value: { body, createElement: () => ({ innerHTML: '' }) },
    writable: true,
    configurable: true,
  });
}

export function createMockFile(path: string, content: string): TFile {
  const name = path.split('/').pop() || path;
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1) : '';
  const basename = dot >= 0 ? name.slice(0, dot) : name;
  const file = new TFile();
  file.path = path;
  file.basename = basename;
  file.extension = ext;
  file.name = name;
  file.stat = { mtime: Date.now(), ctime: Date.now(), size: content.length };
  (file as unknown as Record<string, unknown>).__content = content;
  return file as unknown as TFile;
}

interface MockMetadataCacheEntry {
  tags?: Array<{ tag: string }>;
}

export function mockAppWithFiles(
  entries: Record<string, string>,
  frontmatterByPath?: Record<string, Record<string, unknown>>,
  cacheByPath?: Record<string, MockMetadataCacheEntry>,
) {
  const files: TFile[] = [];
  const byPath = new Map<string, TFile>();

  for (const [p, c] of Object.entries(entries)) {
    const f = createMockFile(p, c);
    files.push(f);
    byPath.set(p, f);
  }

  const vault: Record<string, unknown> = {
    getFiles: () => files,
    cachedRead: async (f: TFile) =>
      (f as unknown as Record<string, unknown>).__content as string || '',
  };

  const resolveLink = (linkpath: string): TFile | null => {
    const clean = linkpath.split('#')[0].split('|')[0].trim();
    if (!clean) return null;
    if (byPath.has(clean)) return byPath.get(clean)!;
    if (byPath.has(`${clean}.md`)) return byPath.get(`${clean}.md`)!;
    const lower = clean.toLowerCase();
    return (
      files.find((file) => file.basename === clean || file.name === clean) ??
      files.find(
        (file) => file.basename.toLowerCase() === lower || file.name.toLowerCase() === lower,
      ) ??
      null
    );
  };

  const metadataCache = {
    getFileCache: (file: TFile) => {
      const fm = frontmatterByPath?.[file.path];
      const cache = cacheByPath?.[file.path];
      if (!fm && !cache) return null;
      return {
        ...(fm ? { frontmatter: fm } : {}),
        ...cache,
      };
    },
    getFirstLinkpathDest: resolveLink,
  };

  const app = { vault, workspace: {}, metadataCache };
  return { app: app as unknown as import('obsidian').App, files, byPath };
}

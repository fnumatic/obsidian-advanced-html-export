import { TFile } from 'obsidian';

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

export function mockAppWithFiles(
  entries: Record<string, string>,
  frontmatterByPath?: Record<string, Record<string, unknown>>,
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

  const metadataCache = {
    getFileCache: (file: TFile) => {
      const fm = frontmatterByPath?.[file.path];
      return fm ? { frontmatter: fm } : null;
    },
  };

  const app = { vault, workspace: {}, metadataCache };
  return { app: app as unknown as import('obsidian').App, files, byPath };
}

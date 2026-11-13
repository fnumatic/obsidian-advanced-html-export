import { describe, it, expect } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import { DEFAULT_SETTINGS } from '../settings';
import { deliverExport } from './exportSaver';

function makeApp(existing: string[] = []) {
  const entries = new Map<string, TFile | TFolder>();
  for (const path of existing) {
    const file = new TFile();
    file.path = path;
    entries.set(path, file);
  }
  const created: string[] = [];
  const modified: string[] = [];
  const vault = {
    getAbstractFileByPath: (path: string) => entries.get(path) ?? null,
    createFolder: async (path: string) => {
      const folder = new TFolder();
      folder.path = path;
      entries.set(path, folder);
    },
    create: async (path: string) => {
      created.push(path);
      const file = new TFile();
      file.path = path;
      entries.set(path, file);
      return file;
    },
    modify: async (file: TFile) => {
      modified.push(file.path);
    },
  };
  return { app: { vault } as unknown as App, created, modified, entries };
}

const autoSave = { ...DEFAULT_SETTINGS, autoSaveExport: true, exportFolder: 'exports' };

describe('deliverExport', () => {
  it('writes into the configured folder and creates it', async () => {
    const { app, created, entries } = makeApp();
    const target = await deliverExport(app, autoSave, '<html></html>', 'note.html');
    expect(target).toBe('exports/note.html');
    expect(entries.has('exports')).toBe(true);
    expect(created).toEqual(['exports/note.html']);
  });

  it('uses the vault root for an empty folder', async () => {
    const { app } = makeApp();
    const target = await deliverExport(app, { ...autoSave, exportFolder: '  ' }, '', 'note.html');
    expect(target).toBe('note.html');
  });

  it('numbers the file when the name is taken and overwriting is off', async () => {
    const { app, created } = makeApp(['exports/note.html', 'exports/note-1.html']);
    const target = await deliverExport(app, autoSave, '', 'note.html');
    expect(target).toBe('exports/note-2.html');
    expect(created).toEqual(['exports/note-2.html']);
  });

  it('replaces the existing file when overwriting is on', async () => {
    const { app, created, modified } = makeApp(['exports/note.html']);
    const target = await deliverExport(app, { ...autoSave, overwriteExport: true }, '', 'note.html');
    expect(target).toBe('exports/note.html');
    expect(modified).toEqual(['exports/note.html']);
    expect(created).toEqual([]);
  });

  it('rejects a folder path that is a file', async () => {
    const { app } = makeApp(['exports']);
    await expect(deliverExport(app, autoSave, '', 'note.html')).rejects.toThrow('is a file');
  });
});

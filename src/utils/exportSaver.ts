/**
 * Delivers a finished export to its destination.
 */
import { App, normalizePath, TFile, TFolder } from 'obsidian';
import type { AdvancedHtmlExportSettings } from '../settings';
import { downloadBlob } from './fileUtils';

/**
 * Saves an export automatically into the configured vault folder, or falls
 * back to the browser download when automatic saving is off.
 * @param app Obsidian app, used for the vault
 * @param settings Plugin settings that select the destination
 * @param html The finished export document
 * @param filename The generated filename, without a folder
 * @returns The vault path or download filename, for the notice
 */
export async function deliverExport(
  app: App,
  settings: AdvancedHtmlExportSettings,
  html: string,
  filename: string,
): Promise<string> {
  if (!settings.autoSaveExport) {
    downloadBlob(new Blob([html], { type: 'text/html' }), filename);
    return filename;
  }

  const folder = normalizePath(settings.exportFolder.trim() || '/');
  await ensureFolder(app, folder);

  const path = resolveTargetPath(app, folder, filename, settings.overwriteExport);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, html);
  } else {
    await app.vault.create(path, html);
  }
  return path;
}

/** Creates the export folder when it does not exist yet. */
async function ensureFolder(app: App, folder: string): Promise<void> {
  if (folder === '/') return;
  const existing = app.vault.getAbstractFileByPath(folder);
  if (existing instanceof TFolder) return;
  if (existing) {
    throw new Error(`Export folder "${folder}" is a file, not a folder.`);
  }
  await app.vault.createFolder(folder);
}

/**
 * Picks the target path: the plain name when it is free or overwriting is
 * allowed, otherwise the first free `name-1.html`, `name-2.html`, ...
 */
function resolveTargetPath(app: App, folder: string, filename: string, overwrite: boolean): string {
  const base = folder === '/' ? '' : `${folder}/`;
  const direct = `${base}${filename}`;
  const existing = app.vault.getAbstractFileByPath(direct);
  if (!existing) return direct;
  if (overwrite && existing instanceof TFile) return direct;

  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  for (let index = 1; index < 1000; index++) {
    const candidate = `${base}${stem}-${index}${extension}`;
    if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
  }
  throw new Error(`No free filename for "${filename}" in "${folder}".`);
}

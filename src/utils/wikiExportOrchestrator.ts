import { App, Component, TFile, type CachedMetadata } from 'obsidian';
import { LinkResolver } from './linkResolver';
import { WikiLinkCollector } from './wikiLinkCollector';
import type { WikiRenderOptions } from './wikiHtmlRenderer';
import { debugLogger } from './debugLogger';
import { CancellationToken, CancellationError } from './cancellationToken';
import { PauseController } from './pauseController';
import { yieldToUI } from './asyncUtils';
import { DetailedWikiRenderer, RenderEvent } from './detailedRenderer';
import { analyzeNoteContent, type NoteAnalysis } from './contentAnalysis';

export interface ExportExcludeRules {
  /** Tags (with or without a leading `#`) that exclude a note. */
  tags?: string[];
  /** Folder paths whose notes are excluded, including subfolders. */
  folders?: string[];
  /** Wiki links or vault paths of notes to exclude. */
  links?: string[];
}

export interface PageFrontmatter {
  title?: string;
  publish?: boolean;
  aliases?: string[];
  tags?: string[];
  author?: string;
  license?: string;
  note?: string;
  export?: {
    scope?: {
      maxDepth?: number;
    };
    exclude?: ExportExcludeRules;
  };
}

/** Accepts a single string or an array and returns trimmed, non-empty entries. */
function toStringList(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const strings = values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return strings.length > 0 ? strings : undefined;
}

/** Parses the `export` frontmatter block, ignoring malformed values. */
function parseExportConfig(value: unknown): PageFrontmatter['export'] {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as {
    scope?: { maxDepth?: unknown };
    exclude?: { tags?: unknown; folders?: unknown; links?: unknown };
  };
  const rawMaxDepth = raw.scope?.maxDepth;
  const maxDepth =
    typeof rawMaxDepth === 'number' && Number.isInteger(rawMaxDepth) && rawMaxDepth >= 0
      ? rawMaxDepth
      : undefined;
  const tags = toStringList(raw.exclude?.tags);
  const folders = toStringList(raw.exclude?.folders);
  const links = toStringList(raw.exclude?.links);
  const exclude = tags || folders || links ? { tags, folders, links } : undefined;
  const scope = maxDepth !== undefined ? { maxDepth } : undefined;
  if (!scope && !exclude) return undefined;
  return { scope, exclude };
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

function normalizeFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, '');
}

/** Collects frontmatter and inline tags from a metadata cache entry. */
function tagsFromCache(cache: CachedMetadata | null): string[] {
  const frontmatterTags = toStringList(cache?.frontmatter?.tags) ?? [];
  const inlineTags = cache?.tags?.map((tag) => tag.tag) ?? [];
  return [...frontmatterTags, ...inlineTags]
    .map(normalizeTag)
    .filter((tag) => tag.length > 0);
}

export type WikiExportOptions = WikiRenderOptions;

export interface NoteInfo {
  file: TFile;
  slug: string;
  title: string;
  path: string;
  depth: number;
  estimatedDiagrams: number;
  codeBlockCount: number;
  linkCount: number;
  frontmatter: PageFrontmatter;
  analysis?: NoteAnalysis;
}

export interface ExportMetrics {
  totalNotes: number;
  estimatedDiagrams: number;
  totalCodeBlocks: number;
  estimatedTimeMinutes: number;
  notesByDepth: Map<number, number>;
}

export type ExportStage = 
  | 'idle' 
  | 'collecting' 
  | 'analyzing' 
  | 'ready' 
  | 'rendering' 
  | 'completed' 
  | 'cancelled';

export class WikiExportOrchestrator {
  private app: App;
  private options: WikiExportOptions;
  private linkResolver: LinkResolver;
  private collector: WikiLinkCollector;
  
  private stage: ExportStage = 'idle';
  private collectedNotes: NoteInfo[] = [];
  private selectedNotes: NoteInfo[] = [];
  private metrics: ExportMetrics | null = null;

  constructor(app: App, _component: Component, options: WikiExportOptions) {
    this.app = app;
    this.options = options;
    this.linkResolver = new LinkResolver();
    this.collector = new WikiLinkCollector(this.app, this.linkResolver);
  }

  getStage(): ExportStage {
    return this.stage;
  }

  getCollectedNotes(): NoteInfo[] {
    return [...this.collectedNotes];
  }

  getSelectedNotes(): NoteInfo[] {
    return [...this.selectedNotes];
  }

  getMetrics(): ExportMetrics | null {
    return this.metrics;
  }

  private getPageFrontmatter(file: TFile): PageFrontmatter {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    return {
      title: fm.title as string | undefined,
      publish: fm.publish as boolean | undefined,
      aliases: toStringList(fm.aliases),
      tags: toStringList(fm.tags),
      author: fm.author as string | undefined,
      license: fm.license as string | undefined,
      note: fm.note as string | undefined,
      export: parseExportConfig(fm.export),
    };
  }

  /**
   * Builds the include predicate for one export. Rules come only from the
   * start note; the start note itself is always kept unless `publish: false`.
   */
  private createInclusionFilter(
    centralFile: TFile,
    centralFm: PageFrontmatter,
  ): (file: TFile) => boolean {
    const rules = centralFm.export?.exclude;
    const tags = new Set((rules?.tags ?? []).map(normalizeTag));
    const folders = (rules?.folders ?? [])
      .map(normalizeFolder)
      .filter((folder) => folder.length > 0);
    const excludedPaths = new Set<string>();

    for (const link of rules?.links ?? []) {
      const target = this.app.metadataCache.getFirstLinkpathDest(link, centralFile.path);
      if (target) excludedPaths.add(target.path);
    }

    return (file: TFile): boolean => {
      if (file.path === centralFile.path) return centralFm.publish !== false;
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter?.publish === false) return false;
      if (excludedPaths.has(file.path)) return false;
      if (folders.some((folder) => file.path.startsWith(`${folder}/`))) return false;
      if (tags.size > 0 && tagsFromCache(cache).some((tag) => tags.has(tag))) return false;
      return true;
    };
  }

  /**
   * Phase 1: Collect all notes without rendering
   * This is fast - just metadata collection
   */
  async collectNotes(centralFile: TFile): Promise<NoteInfo[]> {
    this.stage = 'collecting';
    const centralFm = this.getPageFrontmatter(centralFile);

    // Hard rule: publish: false excludes the note entirely
    if (centralFm.publish === false) {
      this.collectedNotes = [];
      this.calculateMetrics();
      this.stage = 'ready';
      return this.collectedNotes;
    }

    const linkDepth = centralFm.export?.scope?.maxDepth ?? this.options.linkDepth;

    debugLogger.startPhase('collectNotes', { 
      centralFile: centralFile.path,
      linkDepth
    });

    const shouldIncludeFile = this.createInclusionFilter(centralFile, centralFm);

    const collected = await this.collector.collectLinkedFiles(
      centralFile, 
      linkDepth,
      shouldIncludeFile
    );

    // Analyze each note for metrics
    this.stage = 'analyzing';
    debugLogger.startPhase('analyzeNotes', { noteCount: collected.length });

    this.collectedNotes = await Promise.all(
      collected.map(async ({ file, depth }) => {
        const content = await this.app.vault.cachedRead(file);
        const analysis = analyzeNoteContent(content);
        const frontmatter = this.getPageFrontmatter(file);
        
        return {
          file,
          slug: this.linkResolver.getFileSlug(file),
          title: frontmatter.title ?? file.basename,
          path: file.path,
          depth,
          estimatedDiagrams: analysis.diagramCount,
          codeBlockCount: analysis.codeBlockCount,
          linkCount: analysis.linkCount,
          frontmatter,
          analysis,
        };
      })
    );

    debugLogger.endPhase();

    // Calculate metrics
    this.calculateMetrics();
    
    this.stage = 'ready';
    debugLogger.endPhase();

    return this.collectedNotes;
  }

  /**
   * Phase 2: Select which notes to export
   */
  setSelectedNotes(notes: NoteInfo[]): void {
    this.selectedNotes = [...notes];
    this.calculateMetrics();
  }

  /**
   * Phase 3b: Render selected notes with detailed progress tracking
   * This version supports cancellation, pause, and emits detailed events
   */
  async renderNotesWithProgress(
    renderer: DetailedWikiRenderer,
    token: CancellationToken,
    pauseController: PauseController,
    onEvent: (event: RenderEvent) => void
  ): Promise<Map<string, string>> {
    if (this.selectedNotes.length === 0) {
      throw new Error('No notes selected for rendering');
    }

    this.stage = 'rendering';
    debugLogger.startPhase('renderNotesWithProgress', {
      noteCount: this.selectedNotes.length
    });

    const renderedPages = new Map<string, string>();

    // Subscribe to renderer events
    renderer.onRenderEvent(onEvent);

    try {
      for (let i = 0; i < this.selectedNotes.length; i++) {
        const noteInfo = this.selectedNotes[i];

        // Check for cancellation
        token.throwIfCancelled();

        // Check for pause (between notes)
        await pauseController.waitIfPaused();

        try {
          const html = await renderer.renderPageWithProgress(noteInfo.file, token, pauseController);
          renderedPages.set(noteInfo.slug, html);
        } catch (error) {
          if (error instanceof CancellationError) {
            this.stage = 'cancelled';
            throw error;
          }
          // Log error but continue with other notes
          console.error(`Error rendering note ${noteInfo.path}:`, error);
          onEvent({
            type: 'note_error',
            timestamp: Date.now(),
            notePath: noteInfo.path,
            noteTitle: noteInfo.title,
            details: { error: error instanceof Error ? error.message : String(error) }
          });
        }

        // Yield to UI thread
        await yieldToUI();
      }

      this.stage = 'completed';
      debugLogger.endPhase();
      debugLogger.printSummary();

      return renderedPages;
    } catch (error) {
      if (error instanceof CancellationError) {
        this.stage = 'cancelled';
      }
      debugLogger.endPhase();
      throw error;
    }
  }

  /**
   * Calculate export metrics based on collected notes
   */
  private calculateMetrics(): void {
    const notes = this.selectedNotes.length > 0 ? this.selectedNotes : this.collectedNotes;
    
    const totalDiagrams = notes.reduce((sum, note) => sum + note.estimatedDiagrams, 0);
    const notesByDepth = new Map<number, number>();
    
    for (const note of notes) {
      notesByDepth.set(note.depth, (notesByDepth.get(note.depth) ?? 0) + 1);
    }

    // Estimate time: base 2s per note + 3s per diagram
    const baseTimePerNote = 2000; // 2 seconds
    const timePerDiagram = 3000; // 3 seconds
    const totalTimeMs = notes.length * baseTimePerNote + totalDiagrams * timePerDiagram;
    const estimatedTimeMinutes = Math.ceil(totalTimeMs / 60000);

    const totalCodeBlocks = notes.reduce((sum, note) => sum + note.codeBlockCount, 0);

    this.metrics = {
      totalNotes: notes.length,
      estimatedDiagrams: totalDiagrams,
      totalCodeBlocks: totalCodeBlocks,
      estimatedTimeMinutes: Math.max(1, estimatedTimeMinutes),
      notesByDepth,
    };
  }

  reset(): void {
    this.stage = 'idle';
    this.collectedNotes = [];
    this.selectedNotes = [];
    this.metrics = null;
  }
}

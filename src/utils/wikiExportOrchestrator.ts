import { App, Component, TFile } from 'obsidian';
import { LinkResolver } from './linkResolver';
import { WikiLinkCollector } from './wikiLinkCollector';
import { debugLogger } from './debugLogger';
import { CancellationToken, CancellationError } from './cancellationToken';
import { PauseController } from './pauseController';
import { DetailedWikiRenderer, RenderEvent } from './detailedRenderer';

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
  };
}

export interface WikiExportOptions {
  imageQuality: 'high' | 'medium' | 'low';
  enableLazyLoading: boolean;
  enableImageDeduplication: boolean;
  linkDepth: number;
  includeUnlinked: boolean;
  wikiTitle?: string;
  enableThemeToggle?: boolean;
  enableInlineTOC?: boolean;
  defaultTheme?: 'light' | 'dark';
  exportAuthor?: string;
  exportVersion?: string;
}

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
  analysis?: {
    diagramCount: number;
    codeBlockCount: number;
    imageCount: number;
    diagrams: Array<{ type: string; content: string }>;
    codeBlocks: Array<{ language: string; content: string }>;
    images: Array<{ src: string; fileName: string }>;
  };
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
    const rawExportScope = (fm.export as { scope?: { maxDepth?: unknown } } | undefined)?.scope;
    const rawMaxDepth = rawExportScope?.maxDepth;
    const maxDepth = typeof rawMaxDepth === 'number' && Number.isInteger(rawMaxDepth) && rawMaxDepth >= 0
      ? rawMaxDepth
      : undefined;
    return {
      title: fm.title as string | undefined,
      publish: fm.publish as boolean | undefined,
      aliases: Array.isArray(fm.aliases) ? fm.aliases as string[] : undefined,
      tags: Array.isArray(fm.tags) ? fm.tags as string[] : undefined,
      author: fm.author as string | undefined,
      license: fm.license as string | undefined,
      note: fm.note as string | undefined,
      export: maxDepth !== undefined ? { scope: { maxDepth } } : undefined,
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

    const shouldIncludeFile = (file: TFile): boolean => {
      const fm = this.getPageFrontmatter(file);
      return fm.publish !== false;
    };

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
        const analysis = this.analyzeNoteContent(content);
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
          analysis: {
            diagramCount: analysis.diagramCount,
            codeBlockCount: analysis.codeBlockCount,
            imageCount: analysis.images.length,
            diagrams: analysis.diagrams,
            codeBlocks: analysis.codeBlocks,
            images: analysis.images
          }
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
   * Phase 3: Render selected notes
   */
  async renderNotes(
    renderer: { renderPage: (file: TFile, token?: CancellationToken, pauseController?: PauseController, noteInfo?: NoteInfo) => Promise<string> },
    onProgress?: (current: number, total: number, notePath: string) => void
  ): Promise<Map<string, string>> {
    if (this.selectedNotes.length === 0) {
      throw new Error('No notes selected for rendering');
    }

    this.stage = 'rendering';
    debugLogger.startPhase('renderNotes', { 
      noteCount: this.selectedNotes.length 
    });

    const renderedPages = new Map<string, string>();
    const total = this.selectedNotes.length;
    const CHUNK_SIZE = 5;

    try {
      for (let i = 0; i < this.selectedNotes.length; i += CHUNK_SIZE) {
        const chunk = this.selectedNotes.slice(i, i + CHUNK_SIZE);

        const results = await Promise.all(
          chunk.map(async (noteInfo) => {
            debugLogger.logNoteStart(noteInfo.path);
            
            const html = await renderer.renderPage(noteInfo.file, undefined, undefined, noteInfo);
            
            debugLogger.logNoteEnd(noteInfo.path);
            return { slug: noteInfo.slug, html };
          })
        );

        results.forEach(({ slug, html }) => {
          renderedPages.set(slug, html);
        });

        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 0));

        // Report progress
        if (onProgress) {
          chunk.forEach((note, idx) => {
            onProgress(i + idx + 1, total, note.path);
          });
        }
      }

      this.stage = 'completed';
      debugLogger.endPhase();
      debugLogger.printSummary();

      return renderedPages;
    } catch (error) {
      this.stage = 'cancelled';
      debugLogger.endPhase();
      throw error;
    }
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
        await new Promise(resolve => setTimeout(resolve, 0));
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
   * Analyze note content to estimate complexity
   */
  private analyzeNoteContent(content: string): { 
    diagramCount: number; 
    codeBlockCount: number; 
    linkCount: number;
    diagrams: Array<{ type: string; content: string }>;
    codeBlocks: Array<{ language: string; content: string }>;
    images: Array<{ src: string; fileName: string }>;
  } {
    // Count image references
    const imageMatches = content.match(/!\[.*?\]\(.*?\)/g) || [];
    const images = imageMatches.map(match => {
      const srcMatch = match.match(/!\[.*?\]\((.*?)\)/);
      const src = srcMatch ? srcMatch[1] : '';
      return {
        src,
        fileName: src.split('/').pop() || src
      };
    });
    
    // Count mermaid diagrams
    const mermaidMatches = content.match(/```mermaid[\s\S]*?```/g) || [];
    
    // Count other diagram types
    const plantumlMatches = content.match(/```plantuml[\s\S]*?```/g) || [];
    const graphMatches = content.match(/```graph[\s\S]*?```/g) || [];
    
    // Count all code blocks (excluding diagram blocks)
    const allCodeBlocks = content.match(/```[\s\S]*?```/g) || [];
    const diagramBlocks = mermaidMatches.length + plantumlMatches.length + graphMatches.length;
    const codeBlockCount = allCodeBlocks.length - diagramBlocks;
    
    // Build diagrams array
    const diagrams = [
      ...mermaidMatches.map(content => ({ type: 'mermaid', content })),
      ...plantumlMatches.map(content => ({ type: 'plantuml', content })),
      ...graphMatches.map(content => ({ type: 'graph', content }))
    ];
    
    // Build codeBlocks array
    const codeBlocks = allCodeBlocks
      .filter(block => !block.startsWith('```mermaid') && !block.startsWith('```plantuml') && !block.startsWith('```graph'))
      .map(block => {
        const match = block.match(/```(\w+)/);
        return {
          language: match ? match[1] : 'text',
          content: block
        };
      });
    
    // Count wikilinks
    const linkMatches = content.match(/\[\[.*?\]\]/g) || [];

    const diagramCount = imageMatches.length + diagramBlocks;
    const linkCount = linkMatches.length;

    return { diagramCount, codeBlockCount, linkCount, diagrams, codeBlocks, images };
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

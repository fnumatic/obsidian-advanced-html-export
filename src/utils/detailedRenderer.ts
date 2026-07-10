import { TFile } from 'obsidian';
import WikiHtmlRenderer, { type RenderPipelineHooks } from './wikiHtmlRenderer';
import { CancellationToken, CancellationError } from './cancellationToken';
import { PauseController } from './pauseController';
import { analyzeNoteContent, type NoteAnalysis } from './contentAnalysis';

export type RenderEventType = 
  | 'note_start'
  | 'note_complete'
  | 'note_error'
  | 'diagram_start'
  | 'diagram_complete'
  | 'codeblock_start'
  | 'codeblock_complete'
  | 'image_start'
  | 'image_phase'
  | 'image_complete'
  | 'warning_slow_operation';

export interface RenderEvent {
  type: RenderEventType;
  timestamp: number;
  notePath?: string;
  noteTitle?: string;
  details?: Record<string, unknown>;
}

export type RenderEventHandler = (event: RenderEvent) => void;

export type { NoteAnalysis } from './contentAnalysis';

export class DetailedWikiRenderer extends WikiHtmlRenderer {
  private eventHandlers: RenderEventHandler[] = [];
  private currentNoteStartTime = 0;

  onRenderEvent(handler: RenderEventHandler): void {
    this.eventHandlers.push(handler);
  }

  private emit(event: RenderEvent): void {
    this.eventHandlers.forEach(handler => handler(event));
  }

  private async yieldToUI(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * Renders a single note page with progress tracking
   * @security Uses innerHTML to read rendered output from Obsidian's MarkdownRenderer.
   * This is safe as we only read the output, not insert user input.
   * See: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#security
   */
  async renderPageWithProgress(
    file: TFile,
    token: CancellationToken,
    pauseController?: PauseController,
    noteInfo?: { analysis?: { diagramCount: number; codeBlockCount: number; imageCount: number; linkCount: number; diagrams: Array<{ type: string; content: string }>; codeBlocks: Array<{ language: string; content: string }>; images: Array<{ src: string; fileName: string }>; } }
  ): Promise<string> {
    // Wait if paused (between notes)
    if (pauseController) {
      await pauseController.waitIfPaused();
    }

    this.currentNoteStartTime = performance.now();

    token.throwIfCancelled();

    // Phase 1: Reading file (uses shared helper for non-md files like excalidraw)
    token.throwIfCancelled();
    const content = await this.readContentForPage(file);
    await this.yieldToUI();

    // Phase 2: Parsing content (use pre-analyzed data if available)
    token.throwIfCancelled();
    let analysis: NoteAnalysis;
    if (noteInfo?.analysis) {
      analysis = {
        diagramCount: noteInfo.analysis.diagramCount,
        codeBlockCount: noteInfo.analysis.codeBlockCount,
        imageCount: noteInfo.analysis.imageCount,
        linkCount: noteInfo.analysis.linkCount,
        diagrams: noteInfo.analysis.diagrams,
        codeBlocks: noteInfo.analysis.codeBlocks,
        images: noteInfo.analysis.images
      };
    } else {
      analysis = analyzeNoteContent(content);
    }

    // Emit note_start with correct totals
    this.emit({
      type: 'note_start',
      timestamp: Date.now(),
      notePath: file.path,
      noteTitle: file.basename,
      details: { 
        startTime: this.currentNoteStartTime,
        totalDiagrams: analysis.diagramCount,
        totalCodeBlocks: analysis.codeBlockCount,
        totalImages: analysis.imageCount
      }
    });

    try {
      
      this.emit({
        type: 'diagram_start',
        timestamp: Date.now(),
        notePath: file.path,
        details: { 
          totalDiagrams: analysis.diagramCount,
          totalCodeBlocks: analysis.codeBlockCount,
          totalImages: analysis.imageCount
        }
      });

      // Phase 3: Render main content via shared pipeline
      token.throwIfCancelled();

      const renderStartTime = performance.now();
      let totalImages = 0;
      let imageStartTime = 0;

      const hooks: RenderPipelineHooks = {
        afterMarkdownRender: (result) => {
          if (!result.ok) {
            this.emit({
              type: 'note_error',
              timestamp: Date.now(),
              notePath: file.path,
              details: {
                error: result.error ?? 'MarkdownRenderer.render failed',
                timedOut: result.timedOut === true,
              }
            });
          }

          const renderDuration = performance.now() - renderStartTime;
          if (renderDuration > 5000) {
            this.emit({
              type: 'warning_slow_operation',
              timestamp: Date.now(),
              notePath: file.path,
              details: {
                operation: 'markdown_render',
                duration: renderDuration,
                noteName: file.basename
              }
            });
          }
        },
        afterLanguageRestore: () => {
          for (let i = 0; i < analysis.diagramCount; i++) {
            this.emit({ type: 'diagram_complete', timestamp: Date.now(), notePath: file.path });
          }
          for (let i = 0; i < analysis.codeBlockCount; i++) {
            this.emit({ type: 'codeblock_complete', timestamp: Date.now(), notePath: file.path });
          }
        },
        beforeImageProcessing: (el) => {
          token.throwIfCancelled();
          totalImages = el.querySelectorAll('img').length;
        },
        imageHooks: {
          beforeImage: (ctx) => {
            token.throwIfCancelled();
            imageStartTime = performance.now();
            const fileName = this.extractFileNameFromSrc(ctx.src);
            this.emit({
              type: 'image_start',
              timestamp: Date.now(),
              notePath: file.path,
              details: { index: ctx.index, total: ctx.total, fileName }
            });
            this.emit({
              type: 'image_phase',
              timestamp: Date.now(),
              notePath: file.path,
              details: { phase: 'reading', index: ctx.index }
            });
            token.throwIfCancelled();
          },
          beforeHash: (ctx) => {
            this.emit({
              type: 'image_phase',
              timestamp: Date.now(),
              notePath: file.path,
              details: { phase: 'hashing', index: ctx.index }
            });
          },
          beforeOptimize: (ctx) => {
            this.emit({
              type: 'image_phase',
              timestamp: Date.now(),
              notePath: file.path,
              details: { phase: 'optimizing', index: ctx.index }
            });
          },
          afterImage: async (ctx) => {
            const duration = performance.now() - imageStartTime;
            const fileName = this.extractFileNameFromSrc(ctx.src);

            if (duration > 5000) {
              this.emit({
                type: 'warning_slow_operation',
                timestamp: Date.now(),
                notePath: file.path,
                details: {
                  operation: 'image_processing',
                  fileName,
                  duration,
                  index: ctx.index
                }
              });
            }

            this.emit({
              type: 'image_complete',
              timestamp: Date.now(),
              notePath: file.path,
              details: {
                index: ctx.index,
                total: ctx.total,
                duration,
                fileName
              }
            });

            await this.yieldToUI();
          },
        },
      };

      const html = await this.renderResolvedContent(content, file.path, hooks);

      await this.yieldToUI();

      const noteDuration = performance.now() - this.currentNoteStartTime;

      this.emit({
        type: 'note_complete',
        timestamp: Date.now(),
        notePath: file.path,
        details: {
          duration: noteDuration,
          totalImages,
          totalDiagrams: analysis.diagramCount,
          totalCodeBlocks: analysis.codeBlockCount,
          linkCount: analysis.linkCount
        }
      });

      return html;

    } catch (error) {
      if (error instanceof CancellationError) {
        throw error;
      }

      this.emit({
        type: 'note_error',
        timestamp: Date.now(),
        notePath: file.path,
        details: { error: error instanceof Error ? error.message : String(error) }
      });

      throw error;
    }
  }

  private extractFileNameFromSrc(src: string): string {
    if (src.startsWith('data:')) {
      return 'data-uri';
    }
    const parts = src.split('/');
    const fileNameWithParams = parts[parts.length - 1];
    return fileNameWithParams.split('?')[0] || 'unknown';
  }
}

export default DetailedWikiRenderer;

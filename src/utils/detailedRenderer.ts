import { MarkdownRenderer, TFile } from 'obsidian';
import WikiHtmlRenderer from './wikiHtmlRenderer';
import { CancellationToken, CancellationError } from './cancellationToken';
import { PauseController } from './pauseController';
import { hideLanguageIdentifiers, restoreLanguageIdentifiers, parseLanguagesString } from './codeBlockProcessor';

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

export interface NoteAnalysis {
  diagramCount: number;
  codeBlockCount: number;
  imageCount: number;
  linkCount: number;
  diagrams: Array<{ type: string; content: string }>;
  codeBlocks: Array<{ language: string; content: string }>;
  images: Array<{ src: string; fileName: string }>;
}

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

    // Phase 1: Reading file
    token.throwIfCancelled();
    const content = await this.app.vault.cachedRead(file);
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
      analysis = this.analyzeContent(content);
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

      // Phase 3: Render main content
      token.throwIfCancelled();
      const { content: resolvedContent } = this.linkResolver.resolveLinks(content);

      // Pre-process: hide language identifiers to prevent syntax highlighting
      const languages = parseLanguagesString(this.settings.syntaxHighlightLanguages || '');
      const processedContent = this.settings.disableSyntaxHighlighting !== false
        ? hideLanguageIdentifiers(resolvedContent, languages)
        : resolvedContent;

      const el = document.body.createDiv();

      // Render markdown - this is the heavy operation
      const renderStartTime = performance.now();
      await MarkdownRenderer.render(this.app, processedContent, el, '.', this.component);

      // Post-process: restore language identifiers
      if (this.settings.disableSyntaxHighlighting !== false) {
        restoreLanguageIdentifiers(el);
      }

      // Emit diagram_complete for each diagram (MarkdownRenderer processes them internally)
      for (let i = 0; i < analysis.diagramCount; i++) {
        this.emit({
          type: 'diagram_complete',
          timestamp: Date.now(),
          notePath: file.path
        });
      }

      // Emit codeblock_complete for each code block (MarkdownRenderer processes them internally)
      for (let i = 0; i < analysis.codeBlockCount; i++) {
        this.emit({
          type: 'codeblock_complete',
          timestamp: Date.now(),
          notePath: file.path
        });
      }
      
      // Check if rendering took too long
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

      await this.yieldToUI();

      // Remove copy-code buttons
      el.querySelectorAll('.copy-code-button').forEach(e => e.remove());

      // Phase 4: Process images one by one
      token.throwIfCancelled();
      const imgElements = el.querySelectorAll('img');
      const totalImages = imgElements.length;

      for (let i = 0; i < imgElements.length; i++) {
        token.throwIfCancelled();

        const img = imgElements[i];
        const src = img.src;

        if (!src) {
          continue;
        }

        const fileName = this.extractFileNameFromSrc(src);

        this.emit({
          type: 'image_start',
          timestamp: Date.now(),
          notePath: file.path,
          details: {
            index: i,
            total: totalImages,
            fileName: fileName
          }
        });

        const imageStartTime = performance.now();

        // Phase 4a: Reading
        this.emit({
          type: 'image_phase',
          timestamp: Date.now(),
          notePath: file.path,
          details: { phase: 'reading', index: i }
        });

        token.throwIfCancelled();

        // Phase 4b: Process image
        if (this.settings.enableImageDeduplication) {
          this.emit({
            type: 'image_phase',
            timestamp: Date.now(),
            notePath: file.path,
            details: { phase: 'hashing', index: i }
          });

          const hash = await this.convertImageToHash(src);

          this.emit({
            type: 'image_phase',
            timestamp: Date.now(),
            notePath: file.path,
            details: { phase: 'optimizing', index: i }
          });

          img.setAttribute('data-hash', hash);
          img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');

          if (this.settings.enableLazyLoading) {
            img.setAttribute('loading', 'lazy');
          }
        } else {
          this.emit({
            type: 'image_phase',
            timestamp: Date.now(),
            notePath: file.path,
            details: { phase: 'optimizing', index: i }
          });

          const base64 = await this.convertImageToBase64String(src);
          img.setAttribute('src', base64);
          
          if (this.settings.enableLazyLoading) {
            img.setAttribute('loading', 'lazy');
          }
        }

        const imageDuration = performance.now() - imageStartTime;
        
        // Check if image processing was slow
        if (imageDuration > 5000) {
          this.emit({
            type: 'warning_slow_operation',
            timestamp: Date.now(),
            notePath: file.path,
            details: {
              operation: 'image_processing',
              fileName: fileName,
              duration: imageDuration,
              index: i
            }
          });
        }

        this.emit({
          type: 'image_complete',
          timestamp: Date.now(),
          notePath: file.path,
          details: { 
            index: i,
            total: totalImages,
            duration: imageDuration,
            fileName: fileName
          }
        });

        await this.yieldToUI();
      }

      // Phase 5: Clean up links
      token.throwIfCancelled();
      el.querySelectorAll('a[data-page]').forEach((a) => {
        a.removeAttribute('target');
        a.removeAttribute('rel');
        a.removeAttribute('style');
      });

      // Phase 6: Add heading IDs
      token.throwIfCancelled();
      let html = el.innerHTML;
      html = this.addHeadingIds(html);

      // Note: Restoration script is added globally in generateWikiHtml, not per-page

      const noteDuration = performance.now() - this.currentNoteStartTime;

      this.emit({
        type: 'note_complete',
        timestamp: Date.now(),
        notePath: file.path,
        details: {
          duration: noteDuration,
          totalImages: totalImages,
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

  private analyzeContent(content: string): NoteAnalysis {
    // Count image references
    const imageMatches = content.match(/!\[.*?\]\(.*?\)/g) || [];
    
    // Count mermaid diagrams
    const mermaidMatches = content.match(/```mermaid[\s\S]*?```/g) || [];
    
    // Count other diagram types
    const plantumlMatches = content.match(/```plantuml[\s\S]*?```/g) || [];
    const graphMatches = content.match(/```graph[\s\S]*?```/g) || [];
    
    // Count all code blocks (excluding diagram blocks)
    const allCodeBlocks = content.match(/```[\s\S]*?```/g) || [];
    const diagramBlocks = mermaidMatches.length + plantumlMatches.length + graphMatches.length;
    const codeBlockCount = allCodeBlocks.length - diagramBlocks;

    const diagrams: Array<{ type: string; content: string }> = [
      ...mermaidMatches.map(content => ({ type: 'mermaid', content })),
      ...plantumlMatches.map(content => ({ type: 'plantuml', content })),
      ...graphMatches.map(content => ({ type: 'graph', content }))
    ];

    const codeBlocks = allCodeBlocks
      .filter(block => !block.startsWith('```mermaid') && !block.startsWith('```plantuml') && !block.startsWith('```graph'))
      .map(block => {
        const match = block.match(/```(\w+)/);
        return {
          language: match ? match[1] : 'text',
          content: block
        };
      });

    const images = imageMatches.map(match => {
      const srcMatch = match.match(/!\[.*?\]\((.*?)\)/);
      const src = srcMatch ? srcMatch[1] : '';
      return {
        src,
        fileName: src.split('/').pop() || src
      };
    });

    return {
      diagramCount: diagramBlocks,
      codeBlockCount,
      imageCount: imageMatches.length,
      linkCount: this.countLinks(content),
      diagrams,
      codeBlocks,
      images
    };
  }

  private countLinks(content: string): number {
    // Count wiki links [[...]]
    const wikiLinks = content.match(/\[\[[^\]]+\]\]/g) || [];
    // Count markdown links [...]
    const markdownLinks = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
    return wikiLinks.length + markdownLinks.length;
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

// src/ui/modals/RenderingProgressModal.ts
// Wrapper class that bridges Svelte RenderingProgress component with Obsidian's Modal API

import { App, Modal } from 'obsidian';
import { mount, unmount } from 'svelte';
import RenderingProgress from '../../components/RenderingProgress.svelte';
import type { ExportMetrics, NoteInfo } from '../../utils/wikiExportOrchestrator';
import type { CancellationToken } from '../../utils/cancellationToken';
import type { PauseController } from '../../utils/pauseController';
import type { RenderEvent } from '../../utils/detailedRenderer';

export class RenderingProgressModal extends Modal {
  private token: CancellationToken;
  private pauseController: PauseController;
  private metrics: ExportMetrics;
  private resolvePromise: ((result: boolean) => void) | null = null;
  private component: ReturnType<typeof mount> | null = null;

  constructor(
    app: App,
    token: CancellationToken,
    pauseController: PauseController,
    metrics: ExportMetrics,
    _notes: NoteInfo[]
  ) {
    super(app);
    this.token = token;
    this.pauseController = pauseController;
    this.metrics = metrics;
  }

  async openAndAwait(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    // Prevent closing by clicking outside
    this.modalEl.style.pointerEvents = 'auto';

    // Create container for Svelte component
    const container = contentEl.createDiv();
    
    // Mount Svelte component
    this.component = mount(RenderingProgress, {
      target: container,
      props: {
        metrics: this.metrics,
        token: this.token,
        pauseController: this.pauseController,
        onComplete: () => {
          this.handleComplete();
        },
        onCancel: () => {
          this.handleCancel();
        }
      }
    });
  }

  // Public method called by exportWiki to forward events
  handleEvent(event: RenderEvent): void {
    // Access the component's handleEvent method through the mounted instance
    const comp = this.component as unknown as { handleEvent?: (event: RenderEvent) => void };
    if (comp && comp.handleEvent) {
      comp.handleEvent(event);
    }
  }

  private handleComplete(): void {
    if (this.resolvePromise) {
      this.resolvePromise(true);
      this.resolvePromise = null;
    }
    this.close();
  }

  private handleCancel(): void {
    if (this.resolvePromise) {
      this.resolvePromise(false);
      this.resolvePromise = null;
    }
    this.close();
  }

  onClose(): void {
    // Unmount Svelte component
    if (this.component) {
      unmount(this.component);
      this.component = null;
    }

    const { contentEl } = this;
    contentEl.empty();

    // Ensure we resolve if closed unexpectedly
    if (this.resolvePromise) {
      this.resolvePromise(false);
      this.resolvePromise = null;
    }
  }
}

// src/ui/modals/RenderingProgressModal.ts
// Wrapper class that bridges the Svelte RenderingProgress component with Obsidian's Modal API

import { App } from 'obsidian';
import { mount } from 'svelte';
import RenderingProgress from '../../components/RenderingProgress.svelte';
import type { ExportMetrics, NoteInfo } from '../../utils/wikiExportOrchestrator';
import type { CancellationToken } from '../../utils/cancellationToken';
import type { PauseController } from '../../utils/pauseController';
import type { RenderEvent } from '../../utils/detailedRenderer';
import { SvelteModal } from './SvelteModal';

export class RenderingProgressModal extends SvelteModal<boolean> {
  private token: CancellationToken;
  private pauseController: PauseController;
  private metrics: ExportMetrics;

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

  protected mountComponent(target: HTMLElement): ReturnType<typeof mount> {
    return mount(RenderingProgress, {
      target,
      props: {
        metrics: this.metrics,
        token: this.token,
        pauseController: this.pauseController,
        onComplete: () => this.finish(true),
        onCancel: () => this.finish(false),
      },
    });
  }

  // Public method called by exportWiki to forward events
  handleEvent(event: RenderEvent): void {
    const comp = this.getMountedComponent() as unknown as { handleEvent?: (event: RenderEvent) => void } | null;
    comp?.handleEvent?.(event);
  }

  protected getFallbackResult(): boolean {
    return false;
  }
}

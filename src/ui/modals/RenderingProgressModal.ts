import { App } from 'obsidian';
import type { ExportMetrics } from '../../utils/wikiExportOrchestrator';
import type { CancellationToken } from '../../utils/cancellationToken';
import type { PauseController } from '../../utils/pauseController';
import type { RenderEvent } from '../../utils/detailedRenderer';
import { createRenderingProgressView, type RenderingProgressView } from '../views/rendering-progress-view';
import { ViewModal } from './ViewModal';

export class RenderingProgressModal extends ViewModal<boolean, RenderingProgressView> {
  private token: CancellationToken;
  private pauseController: PauseController;
  private metrics: ExportMetrics;

  constructor(
    app: App,
    token: CancellationToken,
    pauseController: PauseController,
    metrics: ExportMetrics
  ) {
    super(app);
    this.token = token;
    this.pauseController = pauseController;
    this.metrics = metrics;
  }

  protected createView(target: HTMLElement): RenderingProgressView {
    return createRenderingProgressView(target, {
      metrics: this.metrics,
      token: this.token,
      pauseController: this.pauseController,
      onComplete: () => this.finish(true),
      onCancel: () => this.finish(false),
    });
  }

  // Public method called by exportWiki to forward events
  handleEvent(event: RenderEvent): void {
    this.getMountedView()?.handleEvent(event);
  }

  /** Signals that the renderer has finished, even if individual notes failed. */
  complete(): void {
    this.getMountedView()?.complete();
  }

  protected getFallbackResult(): boolean {
    this.token.cancel();
    this.pauseController.resume();
    return false;
  }
}

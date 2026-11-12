import { App, Modal } from 'obsidian';
import type { ModalView } from '../view';

/**
 * Base class for modals that own a DOM view and resolve a typed
 * result when the modal closes.
 */
export abstract class ViewModal<TResult, TView extends ModalView = ModalView> extends Modal {
  private mounted: TView | null = null;
  private resolvePromise: ((result: TResult) => void) | null = null;

  protected constructor(app: App) {
    super(app);
  }

  /** Opens the modal and resolves once it closes. */
  async openAndAwait(): Promise<TResult> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  /** Creates the view inside the modal content element. */
  protected abstract createView(target: HTMLElement): TView;

  /** Result used when the modal closes without an explicit choice. */
  protected abstract getFallbackResult(): TResult;

  /** The current view, for typed event forwarding. */
  protected getMountedView(): TView | null {
    return this.mounted;
  }

  onOpen(): void {
    this.contentEl.replaceChildren();
    this.modalEl.classList.add('advanced-html-export-modal');
    this.modalEl.setCssProps({
      '--dialog-width': '700px',
      '--dialog-height': '620px',
      '--dialog-max-width': '90vw',
      '--dialog-max-height': '90vh',
    });
    this.mounted = this.createView(this.contentEl);
  }

  /** Resolves with a result and closes the modal. */
  protected finish(result: TResult): void {
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    resolve?.(result);
    this.close();
  }

  onClose(): void {
    this.mounted?.dispose();
    this.mounted = null;
    this.contentEl.replaceChildren();

    // Ensure we resolve if closed unexpectedly (e.g. Escape key).
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    resolve?.(this.getFallbackResult());
  }
}

import { App, Modal } from 'obsidian';
import { mount, unmount } from 'svelte';

type MountedComponent = ReturnType<typeof mount>;

/**
 * Base class for modals that host a Svelte component and resolve a typed
 * result when the modal closes.
 */
export abstract class SvelteModal<TResult> extends Modal {
  private mounted: MountedComponent | null = null;
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

  /** Mounts the Svelte view into the modal content element. */
  protected abstract mountComponent(target: HTMLElement): MountedComponent;

  /** Result used when the modal closes without an explicit choice. */
  protected abstract getFallbackResult(): TResult;

  /** The mounted component instance, for event forwarding. */
  protected getMountedComponent(): MountedComponent | null {
    return this.mounted;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.modalEl.addClass('advanced-html-export-modal');
    this.mounted = this.mountComponent(this.contentEl);
  }

  /** Resolves with a result and closes the modal. */
  protected finish(result: TResult): void {
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    resolve?.(result);
    this.close();
  }

  onClose(): void {
    if (this.mounted) {
      void unmount(this.mounted);
      this.mounted = null;
    }
    this.contentEl.empty();

    // Ensure we resolve if closed unexpectedly (e.g. Escape key).
    const resolve = this.resolvePromise;
    this.resolvePromise = null;
    resolve?.(this.getFallbackResult());
  }
}

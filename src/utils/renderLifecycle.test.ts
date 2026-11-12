// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, Component, MarkdownRenderer } from 'obsidian';
import HtmlRenderer from './htmlRenderer';
import WikiHtmlRenderer, { type RenderPipelineHooks } from './wikiHtmlRenderer';
import { installObsidianDom } from './test-utils';

class TestWikiRenderer extends WikiHtmlRenderer {
  renderContent(hooks?: RenderPipelineHooks): Promise<string> {
    return this.renderResolvedContent('Test', 'test.md', hooks);
  }
}

const options = {
  imageQuality: 'medium' as const, enableLazyLoading: true, enableImageDeduplication: true,
  linkDepth: 1, includeUnlinked: false,
};

beforeEach(() => {
  installObsidianDom();
  document.body.replaceChildren();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('render lifecycle', () => {
  it.each(['single', 'wiki'])('releases DOM, components and timeout timers after repeated %s renders', async (mode) => {
    const app = new App();
    app.vault.getFiles = vi.fn().mockReturnValue([]);
    const parent = new Component();
    const unload = vi.spyOn(Component.prototype, 'unload');
    const markdown = vi.spyOn(MarkdownRenderer, 'render');
    const renderer = mode === 'single' ? new HtmlRenderer(app, parent, options) : new TestWikiRenderer(app, parent, options);
    for (let run = 0; run < 3; run++) {
      const output = renderer instanceof TestWikiRenderer ? await renderer.renderContent() : await renderer.render('Test');
      expect(output).toContain('Mock rendered content');
      expect(document.body.children).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(unload).toHaveBeenCalledTimes(run + 1);
      expect(markdown.mock.calls[run][4]).not.toBe(parent);
    }
    expect(new Set(markdown.mock.calls.map(call => call[4])).size).toBe(3);
  });

  it('keeps postprocessors alive until processing finishes and cleans up on failure', async () => {
    const app = new App();
    app.vault.getFiles = vi.fn().mockReturnValue([]);
    const unload = vi.spyOn(Component.prototype, 'unload');
    const renderer = new TestWikiRenderer(app, new Component(), options);
    await expect(renderer.renderContent({ beforeImageProcessing: () => {
      expect(unload).not.toHaveBeenCalled();
      expect(document.body.children).toHaveLength(1);
      throw new Error('Processing failed');
    } })).rejects.toThrow('Processing failed');
    expect(unload).toHaveBeenCalledOnce();
    expect(document.body.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

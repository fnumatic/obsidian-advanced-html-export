import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { DetailedWikiRenderer } from './detailedRenderer';
import { CancellationToken } from './cancellationToken';
import type { RenderEvent } from './detailedRenderer';

const settings = {
  imageQuality: 'medium' as const, enableLazyLoading: true, enableImageDeduplication: true,
  linkDepth: 1, includeUnlinked: false,
};

function rendererWith(render: () => Promise<string>) {
  const app = new App();
  app.vault.getFiles = () => [];
  const renderer = new DetailedWikiRenderer(app, { load() {}, unload() {} } as never, settings);
  // Only the progress reporting is under test; file reading and the shared pipeline are bypassed.
  (renderer as unknown as { readContentForPage(): Promise<string> }).readContentForPage = async () => 'content';
  (renderer as unknown as { renderResolvedContent(): Promise<string> }).renderResolvedContent = render;
  return renderer;
}

// Yield-to-UI uses setTimeout, so only the notice interval is faked.
const fakeIntervals = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
afterEach(() => vi.useRealTimers());

describe('slow render notice', () => {
  it('reports a long render while it is still running and stops after it settles', async () => {
    fakeIntervals();
    let finish: (html: string) => void = () => {};
    const renderer = rendererWith(() => new Promise(resolve => { finish = resolve; }));
    const events: RenderEvent[] = [];
    renderer.onRenderEvent(event => events.push(event));

    const task = renderer.renderPageWithProgress(new TFile(), new CancellationToken());
    await new Promise(resolve => setTimeout(resolve, 50));
    vi.advanceTimersByTime(11000);
    const warnings = events.filter(event => event.type === 'warning_slow_operation');
    expect(warnings).toHaveLength(2);
    expect(warnings[0].details).toMatchObject({ operation: 'markdown_render', inProgress: true });

    finish('<p>done</p>');
    await task;
    expect(vi.getTimerCount()).toBe(0);
    expect(events.some(event => event.type === 'note_complete')).toBe(true);
  });

  it('stops reporting when rendering fails', async () => {
    fakeIntervals();
    const renderer = rendererWith(async () => { throw new Error('render broke'); });
    const events: RenderEvent[] = [];
    renderer.onRenderEvent(event => events.push(event));
    await expect(renderer.renderPageWithProgress(new TFile(), new CancellationToken())).rejects.toThrow('render broke');
    expect(vi.getTimerCount()).toBe(0);
    expect(events.filter(event => event.type === 'warning_slow_operation')).toHaveLength(0);
    expect(events.some(event => event.type === 'note_error')).toBe(true);
  });
});

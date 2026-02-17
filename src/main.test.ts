import { beforeAll, describe, it, expect, vi } from 'vitest';
import type { App, PluginManifest } from 'obsidian';
import type AdvancedHtmlExportPlugin from './main';

let TestPlugin: typeof AdvancedHtmlExportPlugin;

vi.mock('virtual:uno.css', () => ({}));

// Mock PluginSettingTab
vi.mock('obsidian', async () => {
  const actual = await vi.importActual('obsidian');
  return {
    ...actual,
    PluginSettingTab: class {}
  };
});

describe('TestPlugin', () => {
  beforeAll(async () => {
    const mod = await import('./main');
    TestPlugin = mod.default;
  });

  it('should be instantiable', () => {
    const plugin = new TestPlugin({} as unknown as App, {} as unknown as PluginManifest);
    expect(plugin).toBeInstanceOf(TestPlugin);
  });

  it('should have onload method', () => {
    const plugin = new TestPlugin({} as unknown as App, {} as unknown as PluginManifest);
    expect(typeof plugin.onload).toBe('function');
  });
});

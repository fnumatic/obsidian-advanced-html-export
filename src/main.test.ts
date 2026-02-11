import { beforeAll, describe, it, expect, vi } from 'vitest';

let TestPlugin: any;

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
    const plugin = new TestPlugin({} as any, {} as any);
    expect(plugin).toBeInstanceOf(TestPlugin);
  });

  it('should have onload method', () => {
    const plugin = new TestPlugin({} as any, {} as any);
    expect(typeof plugin.onload).toBe('function');
  });
});

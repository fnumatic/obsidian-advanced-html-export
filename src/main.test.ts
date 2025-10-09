import { describe, it, expect, vi } from 'vitest';
import TestPlugin from './main';

// Mock PluginSettingTab
vi.mock('obsidian', async () => {
  const actual = await vi.importActual('obsidian');
  return {
    ...actual,
    PluginSettingTab: class {}
  };
});

describe('TestPlugin', () => {
  it('should be instantiable', () => {
    const plugin = new TestPlugin({} as any, {} as any);
    expect(plugin).toBeInstanceOf(TestPlugin);
  });

  it('should have onload method', () => {
    const plugin = new TestPlugin({} as any, {} as any);
    expect(typeof plugin.onload).toBe('function');
  });
});
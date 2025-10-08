import { describe, it, expect } from 'vitest';
import TestPlugin from './main';

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
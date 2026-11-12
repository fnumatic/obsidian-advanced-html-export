import { resolve } from 'node:path';
import { loadConfigFromFile } from 'vite';

export const directory = resolve('benchmarks/svelte-comparison');
export const output = resolve('/tmp/opencode/obsidian-svelte-comparison');

export async function config() {
  const { config: base } = await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve('vite.config.ts'));
  return {
    ...base,
    configFile: false,
    logLevel: 'error',
    build: { ...base.build, outDir: resolve(output, 'native') },
  };
}

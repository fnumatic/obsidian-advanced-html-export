import { build } from 'vite';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { config, output } from './config.mjs';

const variant = 'native';
const options = await config();
let modules = [];
options.plugins.push({ name: 'benchmark-module-audit', generateBundle() { modules = [...this.getModuleIds()]; } });
const start = performance.now();
const cpu = process.cpuUsage();
await build(options);
const elapsedMs = performance.now() - start;
const usage = process.cpuUsage(cpu);
const js = await readFile(resolve(output, variant, 'main.js'));
const css = await readFile(resolve(output, variant, 'styles.css'));
const svelteModules = modules.filter(id => id.includes('/node_modules/') && id.includes('/svelte/'));
if (svelteModules.length) throw new Error(`Svelte still bundled: ${svelteModules}`);
console.log(JSON.stringify({ variant, elapsedMs, cpuMs: (usage.user + usage.system) / 1000,
  peakRssKiB: process.resourceUsage().maxRSS, jsBytes: js.length, cssBytes: css.length,
  gzipJsBytes: gzipSync(js, { level: 9 }).length, svelteModules: svelteModules.length }));

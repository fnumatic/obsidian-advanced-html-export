import { build } from 'vite';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cpus, totalmem } from 'node:os';
import { config, directory, output } from './config.mjs';

const exec = promisify(execFile);
const variant = 'native';
const rounds = Number(process.env.BENCH_ROUNDS || 7);
if (!Number.isInteger(rounds) || rounds < 1) throw new Error('BENCH_ROUNDS must be a positive integer');
await mkdir(output, { recursive: true });
const results = { environment: { date: new Date().toISOString(), node: process.version, cpu: cpus()[0].model, logicalCpus: cpus().length, ramGiB: totalmem() / 1024 ** 3, rounds }, builds: [], browser: [], heap: [] };
results.environment.versions = {};
for (const name of ['vite', 'typescript', 'unocss', 'vitest']) {
  const pkg = JSON.parse(await readFile(new URL(import.meta.resolve(`${name}/package.json`)), 'utf8'));
  results.environment.versions[name] = pkg.version;
}
for (let round = -1; round < rounds; round++) {
  const { stdout } = await exec(process.execPath, [resolve(directory, 'build.mjs')], { maxBuffer: 8 * 1024 ** 2 });
  const result = JSON.parse(stdout.trim().split('\n').at(-1));
  if (round >= 0) results.builds.push({ round, ...result });
  console.log(`Build ${round < 0 ? 'warmup' : round + 1}: ${variant} ${result.elapsedMs.toFixed(0)} ms`);
}
const options = await config();
options.build = { ...options.build, outDir: resolve(output, 'browser', variant), lib: { entry: resolve(directory, 'browser.ts'), formats: ['es'], fileName: () => 'main.js', cssFileName: 'styles' } };
await build(options);
await writeFile(resolve(output, 'browser', variant, 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><script type="module" src="main.js"></script></body></html>');
const server = createServer(async (req, res) => {
  const match = req.url?.match(/^\/(native)\/(index.html|main.js|styles.css)$/);
  if (!match) { res.writeHead(404).end(); return; }
  try {
    const data = await readFile(resolve(output, 'browser', match[1], match[2]));
    res.setHeader('Content-Type', match[2].endsWith('.js') ? 'text/javascript' : match[2].endsWith('.css') ? 'text/css' : 'text/html');
    res.end(data);
  } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const profile = await import('node:fs/promises').then(fs => fs.mkdtemp(resolve(output, 'chrome-')));
const chrome = spawn(process.env.CHROME || '/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-extensions', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const websocket = await new Promise((resolve, reject) => {
    let log = '';
    chrome.stderr.on('data', data => { log += data; const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    chrome.once('error', reject);
    chrome.once('exit', code => reject(new Error(`Chrome exited ${code}: ${log}`)));
  });
  const endpoint = new URL(websocket);
  const pages = await fetch(`http://${endpoint.host}/json/list`).then(response => response.json());
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const events = new Map();
  socket.onmessage = message => {
    const data = JSON.parse(message.data);
    if (data.method && events.has(data.method)) {
      events.get(data.method)(data.params);
      events.delete(data.method);
    }
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id); pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error))); else resolve(data.result);
    }
  };
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const current = ++id; pending.set(current, { resolve, reject }); socket.send(JSON.stringify({ id: current, method, params })); });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const navigate = async () => {
    const loaded = new Promise(resolve => events.set('Page.loadEventFired', resolve));
    await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/${variant}/index.html` });
    await loaded;
    if (!await evaluate('!!window.benchmark')) throw new Error(`Benchmark module failed to load: ${variant}`);
  };
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  const version = await cdp('Browser.getVersion');
  results.environment.chrome = version.product;
  for (let round = -1; round < rounds; round++) {
    await navigate();
    await evaluate('window.benchmark.staticViews()');
    for (const count of [100, 1000, 5000]) {
      const metrics = await evaluate(`window.benchmark.selection(${count})`);
      if (round >= 0) results.browser.push({ round, variant, scenario: 'selection', count, ...metrics });
    }
    for (const count of [100, 500]) {
      const metrics = await evaluate(`window.benchmark.progress(${count})`);
      if (round >= 0) results.browser.push({ round, variant, scenario: 'progress', count, ...metrics });
    }
    console.log(`Browser ${round < 0 ? 'warmup' : round + 1}: ${variant} checks passed`);
  }
  for (let round = 0; round < rounds; round++) {
    await navigate();
    await cdp('HeapProfiler.collectGarbage');
    const before = await cdp('Runtime.getHeapUsage');
    await evaluate('window.benchmark.retainSelection(5000)');
    await cdp('HeapProfiler.collectGarbage');
    const after = await cdp('Runtime.getHeapUsage');
    results.heap.push({ variant, round, count: 5000, usedHeapDelta: after.usedSize - before.usedSize, embedderHeapDelta: after.embedderHeapUsedSize - before.embedderHeapUsedSize });
  }
  await writeFile(resolve(directory, 'production-results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`Results: ${resolve(directory, 'production-results.json')}`);
} finally {
  socket?.close();
  chrome.kill('SIGTERM');
  server.close();
}

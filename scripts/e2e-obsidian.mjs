// Fully automated Obsidian end-to-end test.
// Isolated app instance (own profile, own vault copy, optionally invisible via Xvfb),
// real plugin build, real click path, in-memory download capture. No manual interaction.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const pluginId = 'advanced-html-export';
const pluginDir = `.obsidian/plugins/${pluginId}`;
const sourceVault = process.env.E2E_VAULT || join(homedir(), 'IdeaProjects', 'obs-testvault');
const binary = process.env.OBSIDIAN_BIN || '/opt/Obsidian/obsidian';
const invisible = process.env.E2E_VISIBLE !== '1' && existsSync('/usr/bin/xvfb-run');
const scenarioFilter = process.argv.slice(2).find(arg => arg.startsWith('--scenario='))?.split('=')[1];

const root = await mkdtemp(join(tmpdir(), 'obsidian-e2e-'));
// Keeps the event loop alive so a dropped connection surfaces as an error, not a silent exit.
const keepAlive = setInterval(() => {}, 1000);
process.on('unhandledRejection', error => { console.error('Unhandled rejection:', error); process.exitCode = 1; });
const profile = join(root, 'profile');
const vault = join(root, 'vault');
const evidence = { vault, profile, invisible, startedAt: new Date().toISOString(), steps: [] };

await mkdir(profile, { recursive: true });
await cp(sourceVault, vault, { recursive: true, verbatimSymlinks: true });
for (const [from, to] of [
  [join('dist', 'main.js'), 'main.js'],
  [join('dist', 'styles.css'), 'styles.css'],
  [join('dist', 'manifest.json'), 'manifest.json'],
  ['manifest.json', 'manifest.json'],
]) {
  const target = join(vault, pluginDir, to);
  try {
    await cp(from, target);
  } catch (error) {
    if (!String(error).includes('ENOENT')) throw error;
  }
}
const enabled = JSON.parse(await readFile(join(vault, '.obsidian/community-plugins.json'), 'utf8'));
if (!enabled.includes(pluginId)) {
  await writeFile(join(vault, '.obsidian/community-plugins.json'), JSON.stringify([...enabled, pluginId], null, 2));
}
await writeFile(join(profile, 'obsidian.json'), JSON.stringify({
  vaults: { '0e2e00000000e2e0': { path: vault, ts: Date.now(), open: true } },
  openSchemes: { file: true },
  frame: 'hidden',
  cli: false,
}));

const port = String(9300 + Math.floor(Math.random() * 500));
const args = [
  '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--disable-extensions',
  '--no-first-run', '--disable-background-networking', '--disable-updater',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
];
const app = invisible
  ? spawn('xvfb-run', ['-a', '--server-args=-screen 0 1600x1200x24', binary, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  : spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
app.stdout.on('data', chunk => { output += chunk; });
app.stderr.on('data', chunk => { output += chunk; });
// A killed test process must not leave an invisible Obsidian behind.
const killApp = () => {
  app.kill('SIGTERM');
  setTimeout(() => app.kill('SIGKILL'), 1500).unref?.();
};
process.on('exit', () => app.kill('SIGKILL'));
process.on('SIGTERM', () => { killApp(); process.exit(1); });
process.on('SIGINT', () => { killApp(); process.exit(1); });

let socket;
let session;
try {
  const targets = async () => (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json());
  const connect = async endpoint => {
    const ws = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = message => {
      const data = JSON.parse(message.data);
      if (!data.id || !pending.has(data.id)) return;
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error))); else resolve(data.result);
    };
    ws.onclose = () => {
      for (const { reject } of pending.values()) reject(new Error('DevTools connection closed'));
      pending.clear();
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const current = ++id;
      pending.set(current, { resolve, reject });
      ws.send(JSON.stringify({ id: current, method, params }));
    });
    const evaluate = async expression => {
      const result = await Promise.race([
        send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`CDP evaluate timed out: ${expression.slice(0, 120)}`)), 30000)),
      ]);
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails));
      }
      return result.result.value;
    };
    return { send, evaluate, close: () => ws.close() };
  };

  // The first start of a copied vault shows a security prompt. It is answered in-process,
  // never by a human: the test owns the whole instance.
  const trustScript = `(() => {
    const buttons = [...document.querySelectorAll('button, .mod-cta, .mod-warning')];
    const trust = buttons.find(button => /vertrauen|trust/i.test(button.textContent) && !/eingeschr|restricted|limit/i.test(button.textContent));
    if (!trust) return { clicked: null, buttons: buttons.map(button => button.textContent.trim()).slice(0, 6) };
    trust.click();
    return { clicked: trust.textContent.trim() };
  })()`;

  let answeredPrompt = false;
  const endpoint = await (async () => {
    const start = Date.now();
    let seen = [];
    while (Date.now() - start < 120000) {
      if (app.exitCode !== null) throw new Error(`Obsidian exited early (${app.exitCode})\n${output.slice(-3000)}`);
      try {
        const list = await targets();
        seen = list.map(item => item.url);
        // The first start of a copied vault asks for trust. Obsidian shows this prompt in the
        // vault window, before community plugins are loaded. Answer it in-process.
        if (!answeredPrompt) {
          for (const page of list.filter(item => item.type === 'page' && item.url.startsWith('app://obsidian.md/'))) {
            try {
              const probe = await connect(page.webSocketDebuggerUrl);
              const result = await probe.evaluate(trustScript);
              probe.close();
              if (result.clicked) {
                answeredPrompt = true;
                evidence.trustPrompt = result.clicked;
                console.error(`✓ trust prompt answered in-process: ${result.clicked}`);
                // The vault window reloads after trusting; its DevTools target changes.
                await delay(2000);
                break;
              }
            } catch {}
          }
        }
        const index = list.find(item => item.type === 'page' && item.url.startsWith('app://obsidian.md/index'));
        if (index) return index.webSocketDebuggerUrl;
      } catch {}
      await delay(400);
    }
    throw new Error(`No vault window on port ${port}. Targets: ${seen.join(', ')}\n${output.slice(-3000)}`);
  })();

  session = await connect(endpoint);
  const reconnect = async () => {
    const start = Date.now();
    while (Date.now() - start < 60000) {
      const list = await targets();
      const index = list.find(item => item.type === 'page' && item.url.startsWith('app://obsidian.md/index'));
      if (index) {
        session?.close();
        session = await connect(index.webSocketDebuggerUrl);
        return;
      }
      await delay(400);
    }
    throw new Error('Could not reconnect to the vault window');
  };
  const evaluate = async expression => {
    try {
      return await session.evaluate(expression);
    } catch (error) {
      if (!/closed|timed out/i.test(String(error))) throw error;
      await delay(1000);
      await reconnect();
      return session.evaluate(expression);
    }
  };

  // Trusting a vault opens Obsidian's settings as a separate window. Modals follow the
  // focused window, so the test closes every extra window before driving the UI.
  const closeExtraWindows = async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const list = await targets();
      const extra = list.filter(item => item.type === 'page' && !item.url.startsWith('app://obsidian.md/index'));
      if (!extra.length) return;
      for (const page of extra) {
        try {
          const extraWindow = await connect(page.webSocketDebuggerUrl);
          await extraWindow.evaluate('window.close()');
          extraWindow.close();
        } catch {}
      }
      await delay(500);
    }
    throw new Error('Extra Obsidian windows did not close');
  };
  await closeExtraWindows();
  evidence.popoutsClosed = true;

  const step = async (name, action) => {
    const started = Date.now();
    console.error(`→ ${name}`);
    const value = await action();
    evidence.steps.push({ name, ms: Date.now() - started, value });
    console.error(`✓ ${name} (${Date.now() - started} ms)`);
    return value;
  };
  const waitFor = async (check, label, timeout = 60000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = await evaluate(check);
      if (value) return value;
      await delay(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  const ready = await step('isolated vault and plugin', async () => {
    await waitFor(`!!document.querySelector('.workspace')`, 'workspace layout', 120000);
    const start = Date.now();
    let enabledOnce = false;
    while (Date.now() - start < 120000) {
      // Trust appears only after the vault window exists, so it is answered here as well.
      if (!answeredPrompt) {
        try {
          const result = await evaluate(trustScript);
          if (result?.clicked) {
            answeredPrompt = true;
            evidence.trustPrompt = result.clicked;
            console.error(`✓ trust prompt answered in-process: ${result.clicked}`);
            await delay(3000);
            continue;
          }
        } catch {}
      }
      const state = await evaluate(`(() => ({
        ready: !!(app && app.plugins && app.plugins.plugins && app.commands),
        plugin: !!app?.plugins?.plugins?.['${pluginId}'],
        command: !!app?.commands?.commands?.['${pluginId}:export-wiki-as-html'],
        files: app?.vault?.getMarkdownFiles?.().length ?? 0,
      }))()`);
      if (state.ready && state.plugin && state.command && state.files > 0) return state;
      if (state.ready && !state.plugin) {
        if (!enabledOnce) {
          await evaluate(`(async () => {
            try {
              if (app.plugins.enablePluginAndSave) await app.plugins.enablePluginAndSave('${pluginId}');
              else await app.plugins.enablePlugin('${pluginId}');
            } catch {}
            return true;
          })()`);
          enabledOnce = true;
        }
        // Closing the settings popout keeps modals attached to the vault window.
        await closeExtraWindows().catch(() => {});
      }
      await delay(500);
    }
    throw new Error('Obsidian did not become ready with the plugin enabled');
  });
  // Trusting the vault opens settings in a popout window, which would receive the modals.
  await closeExtraWindows();
  evidence.popoutsClosed = true;
  assert.ok(ready.files > 0);

  // Hermetic downloads: capture the exported Blob, never write into the user's Downloads.
  await evaluate(`(() => {
    const state = window.__e2e = { blobs: new Map(), downloads: [], errors: [], warnings: [] };
    state.originalCreate = URL.createObjectURL;
    URL.createObjectURL = blob => { const url = state.originalCreate.call(URL, blob); state.blobs.set(url, blob); return url; };
    state.originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        state.downloads.push({ name: this.download, url: this.href });
        if (state.blobs.has(this.href)) return;
      }
      return state.originalClick.call(this);
    };
    state.originalWarn = console.warn;
    console.warn = (...parts) => { state.warnings.push(parts.map(String).join(' ')); return state.originalWarn.apply(console, parts); };
    state.onError = event => state.errors.push(String(event.reason?.stack || event.reason));
    window.addEventListener('unhandledrejection', state.onError);
    return true;
  })()`);

  const scenarios = [
    { name: 'single note selected', note: 'export2/01-central-note.md', select: 'export2/02-topic-02.md', pages: 1 },
    { name: 'all collected notes', note: 'export2/01-central-note.md', select: null, pages: null },
  ];
  const results = [];
  for (const scenario of scenarios) {
    if (scenarioFilter && !scenario.name.includes(scenarioFilter)) continue;
    const result = await step(scenario.name, async () => {
      // Modals follow the focused window; keep the vault window alone and clear leftovers.
      await closeExtraWindows();
      await evaluate(`(() => {
        for (const modal of [...document.querySelectorAll('.modal-container')]) {
          const close = modal.querySelector('.modal-close-button, [data-action="close"], [data-action="cancel"]');
          if (close) close.click();
        }
        return true;
      })()`);
      await delay(400);
      await evaluate(`(async () => { await app.workspace.openLinkText(${JSON.stringify(scenario.note.replace(/\.md$/, ''))}, '', false); return true })()`);
      await delay(800);
      await evaluate(`(() => {
        const state = window.__e2e;
        state.downloads.length = 0;
        state.errors.length = 0;
        state.warnings.length = 0;
        window.__e2eUi = { states: [], geometry: [], start: performance.now() };
        window.__e2eObserver?.disconnect();
        window.__e2eObserver = new MutationObserver(() => {
          if (!document.querySelector('.modal-container')) return;
          const snapshot = {
            percent: document.querySelector('[data-tags="pb-text"]')?.textContent || '',
            elapsed: document.querySelectorAll('[data-time]')[0]?.textContent || '',
            title: (document.querySelector('[data-current-title]')?.textContent || '').trim(),
            completed: (document.querySelector('[data-tags="rp-completed"] summary')?.textContent || '').trim(),
            warning: (document.querySelector('[data-warning]')?.textContent || '').trim(),
          };
          const last = window.__e2eUi.states.at(-1);
          if (!last || JSON.stringify(last) !== JSON.stringify(snapshot)) window.__e2eUi.states.push(snapshot);
        });
        window.__e2eObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
        // Dialog geometry can shift without a DOM mutation; sample it independently.
        clearInterval(window.__e2eGeometry);
        window.__e2eGeometry = setInterval(() => {
          const modal = document.querySelector('.modal');
          const section = document.querySelector('[data-tags="rp-current"]');
          if (!modal || !section) return;
          const rect = modal.getBoundingClientRect();
          const entry = {
            w: Math.round(rect.width), h: Math.round(rect.height),
            top: Math.round(rect.top), left: Math.round(rect.left),
            sectionH: Math.round(section?.getBoundingClientRect().height ?? 0),
            parts: {
              title: Math.round(document.querySelector('[data-current-title]')?.getBoundingClientRect().height ?? 0),
              phase: Math.round(document.querySelector('[data-phase]')?.getBoundingClientRect().height ?? 0),
              bar: Math.round(document.querySelector('[data-tags="rp-current"] > [data-tags="pb-container"]')?.getBoundingClientRect().height ?? 0),
              warn: Math.round(document.querySelector('[data-warning]')?.getBoundingClientRect().height ?? 0),
              rows: [...document.querySelectorAll('[data-tags="dr-container"]')].map(row => Math.round(row.getBoundingClientRect().height)).join('/'),
              statuses: [...document.querySelectorAll('[data-tags="dr-status"]')].map(node => Math.round(node.getBoundingClientRect().height)).join('/'),
            },
          };
          const last = window.__e2eUi.geometry.at(-1);
          if (!last || JSON.stringify(last) !== JSON.stringify(entry)) window.__e2eUi.geometry.push(entry);
        }, 100);
        app.commands.executeCommandById('${pluginId}:export-wiki-as-html');
        return true;
      })()`);
      await waitFor(`!!document.querySelector('[data-tags="ep-summary"]')`, 'export preview');
      const summary = await evaluate(`document.querySelector('[data-tags="ep-summary"]').textContent.replace(/\\s+/g, ' ').trim()`);
      let selectionText;
      if (scenario.select) {
        await evaluate(`(() => { document.querySelector('[data-action="selectNotes"]').click(); return true })()`);
        await waitFor(`!!document.querySelector('[data-tags="ns-container"]')`, 'note selection');
        selectionText = await evaluate(`(() => {
          document.querySelector('[data-action="none"]').click();
          const box = [...document.querySelectorAll('.modal input[type="checkbox"]')].find(input => input.dataset.path === ${JSON.stringify(scenario.select)});
          if (!box) throw new Error('Note was not collected: ' + ${JSON.stringify(scenario.select)});
          box.click();
          return document.querySelector('[data-count]').textContent;
        })()`);
        await evaluate(`(() => { document.querySelector('[data-action="export"]').click(); return true })()`);
      } else {
        await evaluate(`(() => { document.querySelector('[data-action="exportAll"]').click(); return true })()`);
      }
      const download = await waitFor(`(() => {
        const state = window.__e2e;
        if (!state.downloads.length || document.querySelector('[data-tags="rp-container"]')) return null;
        return state.downloads.at(-1);
      })()`, 'export download', 120000);
      const analysis = await evaluate(`(async () => {
        const state = window.__e2e;
        const html = await state.blobs.get(state.downloads.at(-1).url).text();
        const states = window.__e2eUi.states;
        const elapsed = states.map(entry => entry.elapsed).filter(Boolean);
        const percents = states.map(entry => Number(entry.percent.replace('%', ''))).filter(Number.isFinite);
        window.__e2eObserver.disconnect();
        clearInterval(window.__e2eGeometry);
        return {
          bytes: html.length,
          pages: (html.match(/class="wiki-page markdown-body/g) || []).length,
          activePage: /class="wiki-page markdown-body active"/.test(html),
          manifest: html.includes('id="export-manifest"'),
          remoteImageSources: (html.match(/<img[^>]+src="https:/g) || []).length,
          uiStates: states.length,
          distinctElapsed: new Set(elapsed).size,
          percents: [...new Set(percents)],
          intermediatePercent: percents.slice(0, -1).some(value => value > 0 && value < 100),
          warningsShown: [...new Set(states.map(entry => entry.warning).filter(Boolean))],
          geometry: window.__e2eUi.geometry,
          completed: states.at(-1)?.completed || '',
          durationMs: Math.round(performance.now() - window.__e2eUi.start),
          errors: state.errors.slice(),
          warnings: state.warnings.slice(),
        };
      })()`);
      if (scenario.pages !== null) assert.equal(analysis.pages, scenario.pages, `${scenario.name}: page count`);
      console.error(`  analysis: ${JSON.stringify({ pages: analysis.pages, uiStates: analysis.uiStates, distinctElapsed: analysis.distinctElapsed, percents: analysis.percents, durationMs: analysis.durationMs })}`);
      assert.ok(analysis.pages > 0, 'export must contain pages');
      assert.ok(analysis.activePage, 'export must show an active page');
      assert.ok(analysis.manifest, 'export must contain the manifest');
      assert.deepEqual(analysis.errors, [], 'no unhandled rejection during export');
      assert.ok(analysis.uiStates >= 3, `progress UI must update repeatedly, saw ${analysis.uiStates}`);
      // The dialog must not grow, shrink or wander while it reports progress.
      const heights = analysis.geometry.map(entry => entry.h);
      const tops = analysis.geometry.map(entry => entry.top);
      assert.ok(Math.max(...heights) - Math.min(...heights) <= 1,
        `dialog height must stay fixed, saw ${JSON.stringify([...new Set(heights)])}`);
      assert.ok(Math.max(...tops) - Math.min(...tops) <= 1,
        `dialog position must stay fixed, saw ${JSON.stringify([...new Set(tops)])}`);
      assert.ok(analysis.percents.includes(100), `progress must reach 100%, saw ${analysis.percents}`);
      // A short export can finish inside the first clock tick; only longer runs must show it advance.
      if (analysis.durationMs > 2000) assert.ok(analysis.distinctElapsed >= 2, 'elapsed timer must advance');
      // Remote images must survive unchanged, but must never stall the render.
      if (analysis.remoteImageSources > 0) {
        assert.ok(analysis.durationMs < 20000, `remote images must not stall the export, took ${analysis.durationMs} ms`);
      }
      // Long renders must say so while they run, instead of looking frozen.
      if (analysis.durationMs > 8000) {
        assert.ok(analysis.warningsShown.some(text => /taking long|Slow operation/i.test(text)),
          `long render must be announced in the dialog, saw ${JSON.stringify(analysis.warningsShown)}`);
      }
      await evaluate(`(() => { document.querySelector('[data-tags="es-container"] [data-action="close"]')?.click(); return true })()`);
      return { ...analysis, download: download.name, summary, selection: selectionText };
    });
    results.push({ scenario: scenario.name, ...result });
  }
  await evaluate(`(() => {
    const state = window.__e2e;
    URL.createObjectURL = state.originalCreate;
    HTMLAnchorElement.prototype.click = state.originalClick;
    console.warn = state.originalWarn;
    window.removeEventListener('unhandledrejection', state.onError);
    return true;
  })()`);
  evidence.results = results;
  evidence.passed = true;
  console.log(JSON.stringify({ passed: true, invisible, trustPrompt: evidence.trustPrompt ?? null, scenarios: results }, null, 2));
} catch (error) {
  evidence.error = String(error.stack || error);
  evidence.recentOutput = output.slice(-4000);
  console.error(JSON.stringify({ passed: false, error: String(error.message || error), steps: evidence.steps, trustPrompt: evidence.trustPrompt ?? null }, null, 2));
  process.exitCode = 1;
} finally {
  session?.close();
  socket?.close();
  clearInterval(keepAlive);
  app.kill('SIGTERM');
  await delay(2000);
  if (app.exitCode === null) app.kill('SIGKILL');
  const path = `/tmp/opencode/obsidian-e2e-${Date.now()}.json`;
  await writeFile(path, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Evidence: ${path}`);
}

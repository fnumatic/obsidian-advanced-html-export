# Headless end-to-end testing for Obsidian plugins

This document describes how to run a real Obsidian, load a plugin build and drive
its UI without a visible window, a mouse or a human. It is written from a verified
setup on Linux (Obsidian 1.15.0/1.14.4, Node 26.12.1, Xvfb, Chrome DevTools
Protocol). The reference implementation is
[`scripts/e2e-obsidian.mjs`](../scripts/e2e-obsidian.mjs); this text explains the
pieces so a new test can be built quickly.

## Why not the `obsidian` CLI

Obsidian ships a CLI (`obsidian eval`, `obsidian command`, `obsidian plugin:reload`).
It is convenient for one-off checks, but it talks to the **user's running app**:

- every modal, notice and window appears on the user's desktop,
- modals block the user's work until someone clicks,
- the CLI is a setting; if it is off, every script fails,
- tests can leave modals, notices and half-finished exports behind.

Use the CLI only for interactive exploration while a human is watching. For
repeatable tests, start a second, isolated Obsidian instance and drive it through
the DevTools Protocol, as described below.

## Architecture

```
test process (Node)
├── copies the vault to a temp dir, installs dist/ into it
├── writes a throw-away profile (obsidian.json)
├── spawns: xvfb-run -a obsidian --user-data-dir=<temp> --remote-debugging-port=<port>
├── polls http://127.0.0.1:<port>/json/list for the vault window
├── connects via WebSocket (CDP), evaluates JavaScript in the page
├── answers the vault trust prompt in-process
├── closes popout windows, then clicks the plugin's buttons
└── asserts on DOM state and captured downloads; kills the process
```

Benefits: no visible window, no shared state with the user's vault, no clicks, and
the real Obsidian renderer, plugin loader and CSS are involved.

## Prerequisites

- Linux with `xvfb-run` (`apt install xvfb`).
- Obsidian installed (`/opt/Obsidian/obsidian` on Linux).
- Node with global `fetch` and `WebSocket` (Node 22+, tested on 26).
- A built plugin: `pnpm build` must produce `dist/main.js`, `dist/styles.css`,
  `dist/manifest.json`.
- A test vault that contains the plugin enabled in
  `.obsidian/community-plugins.json` and the notes the scenario needs.

`E2E_VISIBLE=1` runs the same test with a window, useful for debugging.

## Step by step

### 1. Isolate vault and profile

```js
const root = await mkdtemp(join(tmpdir(), 'obsidian-e2e-'));
const profile = join(root, 'profile');
const vault = join(root, 'vault');
await cp(sourceVault, vault, { recursive: true, verbatimSymlinks: true });
```

Copy the vault, never use it directly: the test may write plugin files and the app
writes its own workspace state.

Install the build into the copied vault, including the manifest. A running
`pnpm dev` watcher writes `dist/` without `manifest.json`, so fall back to the
repository's manifest:

```js
for (const [from, to] of [
  [join('dist', 'main.js'), 'main.js'],
  [join('dist', 'styles.css'), 'styles.css'],
  [join('dist', 'manifest.json'), 'manifest.json'],
  ['manifest.json', 'manifest.json'],
]) {
  try { await cp(from, join(vault, '.obsidian/plugins/<plugin-id>', to)); } catch {}
}
```

Register the vault in a fresh profile. The key of the vault entry is arbitrary; the
path decides what opens:

```js
await mkdir(profile, { recursive: true });
await writeFile(join(profile, 'obsidian.json'), JSON.stringify({
  vaults: { e2e0000000000000: { path: vault, ts: Date.now(), open: true } },
  openSchemes: { file: true },
  frame: 'hidden',
  cli: false,
}));
```

`cli: false` keeps the test profile from claiming the CLI socket of the user's app.

### 2. Start Obsidian invisibly

```js
const child = spawn('xvfb-run', ['-a', '--server-args=-screen 0 1600x1200x24',
  '/opt/Obsidian/obsidian',
  '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer',
  '--no-first-run', '--disable-background-networking', '--disable-updater',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`],
  { stdio: ['ignore', 'pipe', 'pipe'] });
```

Capture stdout/stderr; Obsidian prints load errors and the relevant paths there.

### 3. Find the right DevTools target

Poll `http://127.0.0.1:<port>/json/list`. A fresh profile may first show
`app://obsidian.md/starter.html` (vault picker). Only the vault window
(`app://obsidian.md/index.html`) hosts `app` and the plugin.

```js
const page = targets.find(t => t.type === 'page' && t.url.startsWith('app://obsidian.md/index'));
```

### 4. Connect and evaluate

Use the page's `webSocketDebuggerUrl`, send `Runtime.evaluate` with
`awaitPromise: true, returnByValue: true`. Reject pending calls when the socket
closes, otherwise a crashed app leaves the test hanging with an unresolved
top-level `await` (Node exits with code 13).

```js
ws.onclose = () => { for (const { reject } of pending.values()) reject(new Error('DevTools connection closed')); };
```

Wrap each evaluate in a timeout. The page can be busy or navigating during a
vault reload.

### 5. Answer the trust prompt

The first start of a copied vault shows
"Trust the author of this vault? / Trust author and enable plugins". It lives in
the **vault window**, not in the starter page, and it blocks plugin loading.

Click it in-process; the text is localized, so match both languages and exclude
the restricted-mode button:

```js
const trust = [...document.querySelectorAll('.modal button')]
  .find(b => /vertrauen|trust/i.test(b.textContent) && !/eingeschr|restricted/i.test(b.textContent));
trust.click();
```

The window reloads afterwards, so the DevTools target changes: wait, re-discover
the endpoint and reconnect.

If the plugin still does not load, enable it explicitly after the plugin
subsystem exists:

```js
await evaluate(`(async () => {
  if (!app.plugins.plugins['<plugin-id>']) {
    if (app.plugins.enablePluginAndSave) await app.plugins.enablePluginAndSave('<plugin-id>');
    else await app.plugins.enablePlugin('<plugin-id>');
  }
  return true;
})()`);
```

Poll until `app.plugins.plugins['<plugin-id>']`, the command id and
`app.vault.getMarkdownFiles().length > 0` are all present. `app.plugins` does not
exist during early start-up; do not touch it before the workspace layout exists.

### 6. Keep the modals in one window

Trusting a vault opens Obsidian's settings as a **popout window**. Modals attach
to the focused window, so plugin dialogs can appear in that popout and be invisible
to queries in the main window. Close every extra page target before driving the UI:

```js
for (const page of targets.filter(t => t.type === 'page' && !t.url.startsWith('app://obsidian.md/index'))) {
  const extra = await connect(page.webSocketDebuggerUrl);
  await extra.evaluate('window.close()');
  extra.close();
}
```

Close stale modals as well; a failed run can leave them stacked.

### 7. Open a note and run the plugin

```js
await evaluate(`app.workspace.openLinkText('folder/note', '', false)`);
await evaluate(`app.commands.executeCommandById('<plugin-id>:<command-id>')`);
```

The command is asynchronous; wait for DOM markers (`data-*` attributes, dialog
headers) instead of sleeping.

### 8. Capture downloads without touching the file system

Plugins usually create a `Blob`, call `URL.createObjectURL` and click an anchor
with `download`. Intercept both, keep the Blob, and skip the real click:

```js
const state = { blobs: new Map(), downloads: [] };
const create = URL.createObjectURL;
URL.createObjectURL = blob => { const url = create.call(URL, blob); state.blobs.set(url, blob); return url; };
const click = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () {
  if (this.download) {
    state.downloads.push({ name: this.download, url: this.href });
    if (state.blobs.has(this.href)) return;   // never write to ~/Downloads
  }
  return click.call(this);
};
```

Read the result with `await state.blobs.get(url).text()` and assert on it. Nothing
is written outside the temp directory.

### 9. Assert that the UI actually moves

A frozen-looking dialog has two very different causes: a blocked main thread, or
stale progress data. Distinguish them:

- `MutationObserver` on the dialog: collect distinct snapshots (percentage, clock,
  current file, phase). Fewer than ~3 states during a long run means the UI is not
  updating.
- A 100 ms heartbeat whose lateness reveals blocking. Median lateness near zero
  with many mutations means the thread is fine and the data is the problem.
- `PerformanceObserver({ entryTypes: ['longtask'] })` names blocking tasks.

Measure the end-to-end duration as well; a single stuck await can look like slow
UI work.

### 10. Always clean up

```js
process.on('exit', () => child.kill('SIGKILL'));
process.on('SIGTERM', () => { child.kill('SIGTERM'); process.exit(1); });
process.on('SIGINT', () => { child.kill('SIGTERM'); process.exit(1); });
```

A killed test process otherwise leaves an invisible Obsidian holding a profile and
the CLI socket. Distinguish strays from the user's app by their
`--user-data-dir` and kill only those:

```sh
ps -eo pid=,args= | awk '/\/opt\/Obsidian\/obsidian/ && /user-data-dir=\/tmp\// { print $1 }' | xargs -r kill
```

Write evidence (steps, timings, UI states, warnings, console output) to a file and
print its path. A failing headless test is only debuggable with that evidence.

## Checks worth having in every plugin test

| Check | Why |
|---|---|
| Command id exists | The plugin loaded, not just the app |
| Dialog appears within N ms | The click path is wired |
| ≥ 3 distinct UI states | Progress is live, not a static label |
| Dialog closes and download exists | Completion path, not only the start |
| Exported artifact content | Page count, manifest, escaping |
| No `unhandledrejection` | Async errors surfaced to the UI |
| CSS effect present (`grid`, `flex`, height) | Missing styles can fake speed |
| Duration budget | Guards against stalls such as waiting on remote assets |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Test hangs, Node exits with code 13 | Pending `evaluate` after the socket closed | Reject pending calls on `onclose`; keep the loop alive with an interval |
| No vault window found | App is on `starter.html`, or profile not read | Write `obsidian.json` before spawn; match only `index.html` |
| Plugin never loads | Trust prompt unanswered | Click it in the vault window, wait for reload, reconnect |
| Plugin loads, no dialog appears | Dialog opened in a popout window | Close extra page targets, then reopen |
| `dist/manifest.json` missing | Dev watcher rebuilt `dist/` | Fall back to the repository's `manifest.json` |
| CLI reports "command line interface is not enabled" | A stray test instance with `cli: false` owns the socket | Kill `/tmp` instances, retry |
| UI never changes in the test | Either blocking or stale data | Add heartbeat + mutation sampling (step 9) |

## Cost and limits

- One run starts a full Obsidian: expect a few seconds of start-up per run. Keep
  scenarios in one process and reuse the instance.
- Xvfb and the CDP flags are verified on Linux only. macOS and Windows need their
  own window-hiding approach (untested here).
- Rendering still uses Obsidian's Electron build, but without a compositor;
  visual animations and GPU behaviour are not exercised.
- Screenshot comparison, accessibility audits and long-running memory checks are
  separate work; this harness does not replace them.

## Reference implementation

`scripts/e2e-obsidian.mjs` implements every step above, asserts page count, active
page, manifest, remote-image preservation, UI activity and long-render feedback,
and writes JSON evidence to `/tmp/opencode/`. Copy it as a starting point and
replace the vault, plugin id, command id and selectors.

# Research: Running Obsidian headlessly and triggering plugin commands externally

**Question.** Can Obsidian be operated without a visible UI (no user clicks), and can this
plugin's export command be triggered from outside the app — for example from a script or a
cron job?

**Verdict (short).**

- There is **no official way to run Obsidian's plugin runtime headlessly.** Obsidian is a
  closed-source Electron desktop app. The official CLI (`obsidian`) is a companion to the
  **running GUI app** and cannot work on its own
  (<https://help.obsidian.md/cli>). The official "headless" client
  (`obsidian-headless` / `ob`) only does **Sync and Publish**, not plugin commands
  (<https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Extending%20Obsidian/Obsidian%20Headless.md>).
- Running the **real app on a machine with no screen** (Xvfb, virtual display, Docker VNC
  images) works in practice, but Docker images like `linuxserver/obsidian` and
  `sytone/obsidian-remote` are a **desktop streamed to a browser**, not a headless API.
- The plugin command **can be triggered without a click**, but only while the app is
  running: via the official CLI (`obsidian command id=…`), the **Advanced URI** plugin
  (`commandid`), or the **Local REST API** plugin. No method lets a command receive
  arguments.
- **A fully offline, high-fidelity export without Obsidian is not possible.** The
  `MarkdownRenderer` this plugin relies on exists only inside the app; the `obsidian` npm
  package ships **types only**. Non-Obsidian tools (`obsidian-export`, Quartz, …) can
  convert Markdown but lose Dataview, Excalidraw, Kanban and Obsidian-specific rendering.
- The Obsidian Terms of Service do **not** forbid headless or scheduled use, but headless
  operation of the GUI is **officially unsupported**.

**Practical bottom line for this plugin:** the only way to get *its* output unattended is to
run the real app under a virtual display (Xvfb or the `--ozone-platform=headless` flag),
keep it running, and fire the command through the CLI, Advanced URI or the Local REST API.
Because the wiki export flow opens modals and reads the active file, it needs extra work to
be truly unattended.

---

## 1. Official headless / CLI support

### 1.1 The official CLI requires the running GUI app

Obsidian shipped an official CLI, but it is **not** a standalone binary that renders your
vault. The docs state plainly:

> "Obsidian app must be running … the first command you run launches Obsidian."

Source: <https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Extending%20Obsidian/Obsidian%20CLI.md>
(rendered: <https://help.obsidian.md/cli>). It requires installer **1.12.7+**.

Relevant commands (same page):

- `obsidian command id=<command-id>` — "Execute an Obsidian command … includes all commands
  registered by plugins".
- `obsidian commands` — list available commands.
- `obsidian open path=…` — open a file.
- `obsidian eval code="…"` — run JavaScript with `app` in scope.
- `obsidian dev:…`, `obsidian plugin:reload`.

### 1.2 The official "headless" client is Sync/Publish only

The official headless client is documented separately and does **not** run plugins:

- <https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Extending%20Obsidian/Obsidian%20Headless.md>
- Repository: <https://github.com/obsidianmd/obsidian-headless> (npm `obsidian-headless`,
  binary `ob`; labelled "open beta"; Node 22+).
- Headless Sync: <https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Obsidian%20Sync/Headless%20Sync.md>
- Headless Publish: <https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Obsidian%20Publish/Headless%20Publish.md>

So `ob` can sync or publish a vault from a terminal, but it cannot run
`advanced-html-export:export-wiki-as-html`.

### 1.3 The team's own position: headless GUI is "officially unsupported"

In the forum thread *"A complete terminal based version of Obsidian (headless, no GUI)"*, a
member of the Obsidian team (WhiteNoise, OBSIDIAN TEAM) states
(<https://forum.obsidian.md/t/a-complete-terminal-based-version-of-obsidian-headless-no-gui/111137>):

- The CLI is "a companion terminal based control system to the main GUI app (which must be
  running in the background)".
- Obsidian Headless "is independent from the main app and it is purely terminal-based".
- Running the GUI with no screen "may work, however it is currently officially unsupported.
  So you are on your own."

This is the clearest official statement: headless GUI operation is possible in practice but
unsupported.

---

## 2. Unofficial: running the real app headlessly

### 2.1 Xvfb / systemd (verified how-to)

A community guide documents Obsidian **1.12.7** on headless Ubuntu 24.04
(<https://forum.obsidian.md/t/running-obsidian-headlessly-on-ubuntu-for-ai-agent-workflows-xvfb-systemd-setup/112741>).
It confirms the app runs, with these caveats:

- Chromium crash-loops on GPU init; add `--disable-gpu --disable-software-rasterizer`.
- A stale `SingletonLock` / `SingletonSocket` / `SingletonCookie` in `~/.config/obsidian/`
  blocks startup; clean it first.
- Use a systemd unit with `Restart=always`.
- Wrap the CLI so it exports `DISPLAY=:99`, and run under `xvfb-run`.

In the same thread, user **jiywww** reports that the flag `--ozone-platform=headless` avoids
needing a display entirely, but still requires a running desktop session of Obsidian on the
remote machine. The Emeraldian TUI's README makes the same point about Obsidian's CLI
(see §4.3).

### 2.2 Docker images (real app + VNC, not an API)

- `linuxserver/obsidian` — now built on **Selkies**, streaming the desktop to a browser
  (<https://docs.linuxserver.io/images/docker-obsidian/>). Repo
  <https://github.com/linuxserver/docker-obsidian> (~916 stars, GPL-3.0, pushed 2026-10-11);
  **no authentication by default**, runs privileged, serves HTTPS on port 3001.
- `sytone/obsidian-remote` — **KasmVNC in Docker**
  (<https://github.com/sytone/obsidian-remote>; ~2.6k stars, MIT, pushed 2026-09-06).

Both give you **the real Obsidian in a virtual display**, reachable over web VNC / noVNC.
They are not a headless export API: to run a command you still need the app running and a
way to trigger it.

---

## 3. Triggering a plugin command without a UI click

All of the following need the **app running**; none can receive command arguments.

### 3.1 Official CLI

`obsidian command id=advanced-html-export:export-wiki-as-html`
(<https://help.obsidian.md/cli>), or run it via `eval`:
`obsidian eval code="app.commands.executeCommandById('advanced-html-export:export-wiki-as-html')"`.

### 3.2 Advanced URI plugin

Advanced URI's `<command>, <identification>` action means "Opens file and then executes
command"; the maintainer recommends `commandid`
(<https://vinzent03.github.io/obsidian-advanced-uri/actions/commands>). Example link for
this plugin:

```
obsidian://advanced-uri?vault=<vault>&filepath=<note>&commandid=advanced-html-export%3Aexport-wiki-as-html
```

### 3.3 Local REST API plugin

Exposes `GET /commands/` and `POST /commands/{commandId}/`, plus an MCP `command_execute`
tool (<https://github.com/coddingtonbear/obsidian-local-rest-api>, ~3.1k stars). This is the
most script-friendly option. By default it serves HTTPS on `127.0.0.1:27124` with a
self-signed certificate; plain HTTP on `127.0.0.1:27123` must be enabled in its settings.

### 3.4 QuickAdd and the base `obsidian://` URI

- QuickAdd supports `obsidian://quickadd` links, launchers/schedulers, and can drive the
  Obsidian CLI (<https://github.com/chhoumann/quickadd>).
- The base Obsidian URI supports `open`, `new`, `daily`, `unique`, `search`,
  `choose-vault` and `x-success` / `x-error` callbacks, but **no command execution**, and
  **commands cannot receive arguments**
  (<https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Extending%20Obsidian/Obsidian%20URI.md>).

### 3.5 Render API plugin (closest thing to external MarkdownRenderer)

The community **Render API** plugin exposes Obsidian's full markdown / Dataview / Tasks
render pipeline over a local REST API and MCP — but it is **"Desktop Obsidian only"** and
still needs the app running (<https://github.com/caesarloo/render-api>;
<https://www.obsidianstats.com/plugins/render-api>).

---

## 4. Non-Obsidian tools: what they can and cannot reproduce

If you want a genuinely unattended pipeline with **no Obsidian process**, these are the
options. All of them rebuild parts of the pipeline themselves and **none** provides
Obsidian's `MarkdownRenderer`.

### 4.1 `obsidian-export`

Rust CLI/library (<https://github.com/zoni/obsidian-export>,
<https://crates.io/crates/obsidian-export>; BSD-2-Clause-Patent, v25.3.0 2025-03-25,
~1.3k stars). Converts Obsidian Markdown to CommonMark and resolves `[[wikilinks]]` and
`![[embeds]]`. Its README is explicit: *"It supports most but not all of Obsidian's Markdown
flavor"* — **no Dataview, Excalidraw or Kanban**, and no Obsidian renderer.

### 4.2 Quartz

Static-site generator with an "ObsidianFlavoredMarkdown" mode
(<https://quartz.jzhao.xyz/> and its Obsidian-compatibility page): wikilinks,
transclusions, highlights, comments, tags, callouts, tasks, Mermaid. **Dataview** only via
the community *Quartz Syncer*; **Excalidraw** only via a community plugin. The output is
HTML for a website, not this plugin's self-contained export format.

### 4.3 Other candidates

- `obsidian-webpage-export`, ObsidianHtml, Pandoc filters, `markdown-it-wikilinks`: each
  handles a subset of Obsidian syntax; none runs Obsidian's renderer. (Mentioned for
  completeness; not deeply verified here.)
- `emeraldian` — an independent TUI that reads vault files without Obsidian
  (<https://github.com/iamrohithrnair/emeraldian>, ~543 stars, GPL-3.0). Its README notes that
  Obsidian's CLI needs `--ozone-platform=headless` or Xvfb on a machine without a display;
  emeraldian itself needs no Obsidian.

**What is lost without Obsidian:** Dataview queries, Excalidraw drawings, the Kanban
plugin, and anything that depends on Obsidian's `MarkdownRenderer` — which is exactly what
this plugin uses.

---

## 5. Does the `obsidian` npm package ship a runtime?

**No — types only.** Verified by downloading the tarball `obsidian-1.14.4.tgz` from the
registry (<https://registry.npmjs.org/obsidian/latest>): it contains only `package.json`,
`CHANGELOG.md`, `LICENSE.md`, `README.md`, `canvas.d.ts`, `obsidian.d.ts`, `publish.d.ts` —
no `.js`/runtime. `package.json` has `"main": ""` and `"types": "obsidian.d.ts"`.
`MarkdownRenderer` is only a **declaration**.

Consequence: you cannot import `obsidian` in Node and render notes. A truly headless,
high-fidelity reproduction of *this* plugin without the app is not possible.

---

## 6. Legality / ToS / licensing

- **License:** Obsidian is now **free for all purposes including commercial**. Optional
  Commercial / Catalyst licenses exist for support
  (<https://obsidian.md/license>, last updated 2025-02-20).
- **Terms of Service** grant a license "to install and execute OBSIDIAN … on machines
  operated by or for you" (<https://obsidian.md/terms>). They prohibit reverse engineering
  except to develop third-party plugins for non-commercial use, and prohibit
  "disable, hack or otherwise interfere with any security, digital signing, DRM,
  verification or authentication mechanisms".
- **Nothing in the ToS specifically forbids headless or cron use.** However, the app is
  proprietary and headless operation is **officially unsupported** (§1.3), so you run it at
  your own risk.

---

## Comparison

| Approach | Runs without a visible UI? | Runs this plugin's export? | Runs unattended (cron)? | Fidelity of output | Sources |
|---|---|---|---|---|---|
| Official `obsidian` CLI | No (companion to running GUI) | Yes, `command id=…` | Only with the GUI kept alive | Exact | <https://help.obsidian.md/cli> |
| Official `ob` (obsidian-headless) | Yes (terminal) | **No** (Sync/Publish only) | Yes, for sync/publish | N/A for export | <https://github.com/obsidianmd/obsidian-headless> |
| Real app + Xvfb / `--ozone-platform=headless` | Yes (virtual/no display) | Yes | Yes, with setup + flags | Exact | <https://forum.obsidian.md/t/running-obsidian-headlessly-on-ubuntu-for-ai-agent-workflows-xvfb-systemd-setup/112741> |
| Docker `linuxserver/obsidian` | Streamed desktop (browser) | Yes | Yes, if app kept running | Exact | <https://docs.linuxserver.io/images/docker-obsidian/> |
| Docker `sytone/obsidian-remote` | Streamed desktop (browser) | Yes | Yes, if app kept running | Exact | <https://github.com/sytone/obsidian-remote> |
| Advanced URI `commandid` | Needs running app | Yes | Yes, if app kept running | Exact | <https://vinzent03.github.io/obsidian-advanced-uri/actions/commands> |
| Local REST API | Needs running app | Yes | Yes, if app kept running | Exact | <https://github.com/coddingtonbear/obsidian-local-rest-api> |
| Render API plugin | Needs running app | Markdown render only | Yes, if app kept running | High (full render pipeline) | <https://github.com/caesarloo/render-api> |
| `obsidian-export` | Yes (CLI) | No | Yes | Partial (no Dataview/Excalidraw/Kanban) | <https://github.com/zoni/obsidian-export> |
| Quartz | Yes (build step) | No | Yes | Partial (site output) | <https://quartz.jzhao.xyz/> |
| `obsidian` npm package | N/A (types only) | No | No | None | <https://registry.npmjs.org/obsidian/latest> |

---

## Practical recommendation for this plugin

1. **If exact output is required, keep the real app running.** Run Obsidian under Xvfb
   (or `--ozone-platform=headless`), apply the GPU and lockfile workarounds from §2.1, and
   trigger the command via the official CLI, the Local REST API, or Advanced URI. This is
   the only route that produces the plugin's real HTML.

2. **Prefer the Local REST API for automation.** It is the most script- and cron-friendly
   (HTTPS with a self-signed cert, optional plain HTTP, `POST /commands/{commandId}/`) and
   avoids the brittle desktop-URI handshake.

3. **Fix the modal/active-file coupling for unattended use.** Both commands in `src/main.ts`
   (`export-current-file-as-html`, `export-wiki-as-html`) call
   `this.app.workspace.getActiveFile()` (`src/commands/exportSingleFile.ts`,
   `src/commands/exportWiki.ts`). The wiki flow additionally opens
   `ExportPreviewModal`, `NoteSelectionModal` and `RenderingProgressModal`, plus
   `ExportStatisticsModal` when statistics are enabled (`src/commands/exportWiki.ts`). For
   cron use, add a headless entry point that takes an explicit target path and skips or
   auto-confirms those modals.

4. **`isDesktopOnly: true` is accurate.** Because the export depends on Obsidian's
   `MarkdownRenderer` and modals, there is no mobile/headless runtime substitute. Keep the
   manifest flag.

5. **For a truly Obsidian-free pipeline, accept feature loss.** Choose `obsidian-export` or
   Quartz on a machine that never runs Obsidian. You gain a clean unattended cron job and
   lose Dataview, Excalidraw, Kanban and Obsidian's exact rendering.

---

## Verification notes

- Core claims were re-verified on 2026-10-26; star counts and "pushed" dates are snapshots
  and will drift.
- All statements above cite pages that were **actually fetched** during this research.
- Items marked "not deeply verified" (§4.3 first bullet) are listed for completeness only.
- The `obsidian` npm claim was confirmed by inspecting the published tarball contents, not
  by inference.
- Headless GUI behavior is **officially unsupported** by the Obsidian team; the Xvfb/Docker
  routes are community solutions and may break on app updates.

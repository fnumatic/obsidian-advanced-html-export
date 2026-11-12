# Native plugin UI

The four export dialogs now use TypeScript and the DOM API. The plugin has no
Svelte runtime, compiler plugin, extractor, type configuration, or dependency.
The export engine and the HTML application inside exported files are unchanged.

## Structure

- `src/ui/modals/ViewModal.ts`: Obsidian lifecycle, typed promise results,
  synchronous disposal, and fallback results for external close/Escape.
- `src/ui/modals/*Modal.ts`: small bridges from export commands to views.
- `src/ui/views/`: one view per dialog; each returns a `dispose()` method.
- `src/ui/components/`: shared overall/detail progress bars and detail rows.
- `src/ui/view-helpers.ts`: shared controls, icons, note statistics, cached
  element lookup, and change-only text updates.
- `src/ui/rendering-progress-store.ts`: plain state, event handling, timers,
  and a single change callback. It has no DOM dependency.
- `src/ui/types.ts`: shared view contracts; progress state is not duplicated.
- `src/ui/styles/plugin-styles.css`: shared styles and scoped artifact table.
- `uno.config.ts`: scans UI TypeScript templates, excluding tests. Dynamic icon
  classes stay explicitly safelisted. No component compiler extracts CSS.

## Lifecycle and safety

- Views create their static markup once. Dynamic updates keep DOM references.
- Note selection sorts once, caches label/checkbox rows, and reattaches matching
  rows during search. Selection is a mutable `Set`; hidden choices persist.
- Checkbox labels support pointer clicks and native keyboard Space. Enter also
  toggles the focused checkbox. Search and checkboxes have accessible names.
- Completed notes append once. `push` retains the completed list instead of
  copying an ever-growing array on every event.
- The dialog keeps one fixed geometry: the phase line reserves its height, status
  lines are single-line with an ellipsis, the warning strip has a fixed height and
  the completed list has fixed min/max heights. Without that, the phase line
  collapsed between notes (14 px → 0) and the centered modal jumped 23 px up and
  down on every note. The end-to-end test samples the modal rectangle every 100 ms
  and fails if height or position changes.
- All user strings interpolated into markup use the existing `escapeHtml` helper.
  Progress and warning text use `textContent`. No HTML from notes is executed.
- Every view owns an `AbortController` for listeners. Disposal removes listeners
  and clears timers synchronously. The modal then empties its content.
- Progress disposal clears the ticker, warning timeout, and completion/cancel
  callback. Late render events and repeated cancel actions are ignored.
- Completion follows the rendering result of the export command, not a UI
  counter. Notes that fail still allow the export to finish with the rendered
  remainder; a cancelled export closes the dialog and reports cancellation.
- Cancelling resumes a paused renderer after cancelling its token. Closing a
  pending progress modal externally also cancels and resumes rendering.
- The export command observes render failures immediately, including rejections
  after the modal returns cancellation. Successful exports still await and report
  the original render result or error.
- Modal instances can close and reopen. No component runtime or source adapter
  is needed for mounting, state changes, or cleanup.

## Production measurements

Measured on 2026-11-12 with Node 26.12.1, Chrome 157.0.8103.50 headless,
Vite 8.1.3, TypeScript 6.0.3, UnoCSS 66.7.4 and Vitest 4.1.10. Machine:
Ryzen 9 7940HS, 16 logical CPUs, 43.9 GiB RAM visible to the OS.

Seven measured rounds plus one discarded warmup; values below are medians.
Raw data: [production-results.json](../benchmarks/svelte-comparison/production-results.json).

| Metric | Production native UI |
|---|---:|
| Complete plugin JS, minified | 115,272 B / 112.6 KiB |
| Complete plugin JS, gzip level 9 | 33,583 B / 32.8 KiB |
| Plugin CSS | 18,752 B / 18.3 KiB |
| Svelte modules in build graph | 0 |
| Build API wall time, excluding config loading | 308.0 ms |
| Build process CPU time | 485.4 ms |
| Selection mount, 100 notes | 4.9 ms |
| Selection mount, 1000 notes | 43.7 ms |
| Selection mount, 5000 notes | 263.7 ms |
| Search, 5000 notes | 24.8 ms |
| Toggle checkbox, 5000 notes | 0.9 ms |
| Progress, 2500 events / 500 notes | 266.5 ms |
| Retained JS heap delta, 5000 notes | 1.22 MiB |
| Embedder heap delta, 5000 notes | 58.38 MiB |

The archived Svelte bundle is 189,311 B. The production bundle is **39.1% smaller**.
This byte comparison is deterministic. The historical experiment's native bundle
was a different implementation; its faster timings must not be presented as
current production timings. These runs are not a fresh paired Svelte/native test.

Timing includes synchronous DOM updates and forced layout, not screen paint or
INP. Progress flushes layout per event, which is an update-heavy stress scenario.
Heap deltas follow explicit garbage collection. JS heap excludes native DOM
allocations; neither heap metric equals total Obsidian RAM consumption.

## Checks and reproduction

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm type-check
pnpm build
node benchmarks/svelte-comparison/run.mjs
```

### Fully automated end-to-end export test

`scripts/e2e-obsidian.mjs` runs the real plugin in a real Obsidian, with no
manual clicks and no window on the user's desktop:

- starts a second Obsidian process with its own `--user-data-dir` inside Xvfb,
- copies the test vault into a temp directory and installs the current `dist/`
  build there,
- answers the first-run vault trust prompt in-process (it is the plugin's own
  temporary vault, never the user's),
- closes the settings popout, because Obsidian attaches modals to the focused
  window,
- executes the wiki export command and clicks the preview/selection buttons
  through Chrome DevTools Protocol in that process,
- captures the exported Blob in memory instead of writing to `~/Downloads`,
- asserts page count, active page, manifest, no unhandled rejection, at least
  three distinct progress-UI states, progress reaching 100%, and that a render
  longer than 8 s announces itself in the dialog,
- shuts the isolated process down and writes JSON evidence to `/tmp/opencode/`.

Last verified run (two scenarios, invisible, no interaction):
one selected note → 1 page, 1.6 s, 6 UI states; all 53 collected notes →
53 pages, 2.4 s, 114 UI states, 2 remote image sources preserved, no warnings.

```sh
pnpm test:e2e
pnpm test:e2e --scenario="all collected notes"
```

`E2E_VISIBLE=1` shows the isolated window for debugging. If the test fails, the
JSON evidence names the step, the captured console warnings and the recent
Obsidian output. Earlier variants that drove the user's running vault were
removed: they needed a live app, could steal focus, and left modals behind.

The generic recipe, pitfalls and a troubleshooting table are in
[Headless end-to-end testing](headless-obsidian-testing.md), so a new plugin test
can be built from it without rediscovering the trust prompt, popout-window and
connection issues.

- 260 tests pass, including native view, modal lifecycle, remote-image
  pre-blanking and slow-render notice tests.
- Coverage includes search, preserved selection, keyboard/label toggles, all
  preview actions, compressed/uncompressed statistics, escaping, progress,
  warning expiry, timer disposal, external close, cancellation, reopen, the
  in-progress slow-render notice during a stalled Markdown render, and
  remote-image pre-blanking (including untouched fenced code blocks).
- Production-browser assertions pass in every measured round. They also check
  actual grid/flex styles and list height, preventing missing CSS from falsely
  improving timings.
- The automated Obsidian end-to-end test passes both scenarios, including the
  real download Blob, page counts and dialog updates.
- Typecheck and production build pass. The lockfile contains no Svelte packages.

## Known behaviour: notes with unreachable remote images

A note whose Markdown contains remote images made Obsidian's `MarkdownRenderer`
wait for those requests. In the test vault two `picsum.photos` images hit the
30 s render timeout, and the dialog looked frozen: the clock ticked, nothing
else moved.

Fixed by pre-blanking: remote image destinations are replaced with a transparent
pixel before rendering and restored afterwards. The exporter never embeds
`http(s)` images anyway, so the exported markup is unchanged (verified: 2 remote
image sources survive) while the wait is gone.

Measured with the automated test, 53 notes, same vault:

| | before | after |
|---|---:|---:|
| Duration | 32.3 s | 2.4 s |
| Distinct UI states | 150 (clock only for 30 s) | 114 |
| Long-render warnings | 6 | 0 |
| Exported pages | 53 | 53 |

The dialog also names the running phase now: `Rendering Markdown · 3 s`,
`Processing images · 1 s`, plus a pulsing progress bar while work is in flight.
Even a genuinely slow render therefore moves instead of standing still.

## Limits

Not checked: screenshot parity, a complete accessibility audit, or long-running
leak behavior. The migration does not establish a faster complete export or
smaller exported HTML.

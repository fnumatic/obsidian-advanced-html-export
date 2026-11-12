# Svelte versus native DOM: measured results

> Historical experiment, before the production migration. The descriptions below
> refer to that source state. Svelte has since been removed from the plugin and
> its dependencies. See [Native UI](native-ui.md) for the current architecture,
> measurements, and checks. The archived raw samples remain unchanged.

## Scope

Experimental replacement of all four plugin dialog views: note selection, preview,
rendering progress, and export statistics. Production files remain untouched.
The export engine and exported HTML application are unchanged.

## Environment

- Run: 2026-11-12T08:44:47.796Z.
- CPU: AMD Ryzen 9 7940HS w/ Radeon 780M Graphics; 16 logical CPUs.
- RAM: 43.9 GiB visible to the OS.
- v26.12.1; Chrome/157.0.8103.50; Linux.
- svelte 5.56.4; vite 8.1.3; typescript 6.0.3; unocss 66.7.4; vitest 4.1.10.
- 7 measured rounds per variant, plus one discarded warmup.

## Measurements

Values are medians. Negative change means less time or fewer bytes.

| Metric | Svelte | Native DOM | Change |
|---|---:|---:|---:|
| Plugin JavaScript, minified | 184.9 KiB | 111.1 KiB | -39.9% |
| Plugin JavaScript, gzip level 9 | 58.4 KiB | 32.4 KiB | -44.6% |
| Plugin CSS | 18.5 KiB | 18.4 KiB | -0.6% |
| Build wall time | 382.6 ms | 207.6 ms | -45.8% |
| Build CPU time | 710.4 ms | 337.6 ms | -52.5% |
| Build peak RSS | 416.83 MiB | 323.79 MiB | -22.3% |
| Mount, 100 notes | 8.0 ms | 4.5 ms | -43.8% |
| Search, 100 notes | 1.2 ms | 0.8 ms | -33.3% |
| Select none, 100 notes | 0.7 ms | 0.5 ms | -28.6% |
| Select all, 100 notes | 0.5 ms | 0.4 ms | -20.0% |
| Toggle checkbox, 100 notes | 0.2 ms | 0.2 ms | -0.0% |
| Unmount, 100 notes | 0.6 ms | 0.4 ms | -33.3% |
| Mount, 1000 notes | 54.1 ms | 37.7 ms | -30.3% |
| Search, 1000 notes | 9.5 ms | 4.6 ms | -51.6% |
| Select none, 1000 notes | 4.7 ms | 2.9 ms | -38.3% |
| Select all, 1000 notes | 4.5 ms | 2.7 ms | -40.0% |
| Toggle checkbox, 1000 notes | 1.2 ms | 0.5 ms | -58.3% |
| Unmount, 1000 notes | 6.2 ms | 3.8 ms | -38.7% |
| Mount, 5000 notes | 345.0 ms | 216.1 ms | -37.4% |
| Search, 5000 notes | 50.1 ms | 24.5 ms | -51.1% |
| Select none, 5000 notes | 23.3 ms | 15.9 ms | -31.8% |
| Select all, 5000 notes | 25.9 ms | 15.5 ms | -40.2% |
| Toggle checkbox, 5000 notes | 3.9 ms | 1.0 ms | -74.4% |
| Unmount, 5000 notes | 32.7 ms | 22.0 ms | -32.7% |
| Progress, 500 events / 100 notes | 85.9 ms | 41.0 ms | -52.3% |
| Progress, 2500 events / 500 notes | 510.6 ms | 221.2 ms | -56.7% |
| Retained JS heap delta, 5000 notes | 25.63 MiB | 1.28 MiB | -95.0% |
| Embedder heap delta, 5000 notes | 64.32 MiB | 58.14 MiB | -9.6% |

- svelte: build wall-time range 373.2 ms–391.4 ms.
- native: build wall-time range 198.8 ms–209.0 ms.

## Method

- Both variants use the current working tree, including pre-existing user changes.
- Builds run serially in fresh Node processes. Variant order alternates each round.
- Build time surrounds Vite's production build API. It excludes process startup,
  config loading, dependency installation, and the manifest-copy step.
- Build CPU time is process user plus system CPU time. Peak RSS includes config loading.
- Native module audit rejects any loaded Svelte runtime module; the native run loads zero.
  The baseline module graph loads 99 Svelte modules (not 99 separate output files).
- Production JS sizes describe the complete plugin, not just standalone UI bundles.
  gzip is a distribution-size proxy; Obsidian executes the uncompressed bundle.
- Chrome runs headless with a fresh profile. UI bundles use production compilation.
- Original UnoCSS classes and component CSS are retained in the native build.
  Assertions verify list height, grid layout, and flex rows. CSS differs slightly
  because native styles are unscoped; do not interpret that difference as a benefit.
- Note datasets contain 100, 1000, or 5000 deterministic entries. Both variants
  render the full list. Neither uses virtualization.
- UI timing includes synchronous DOM work and a forced style/layout read. It does
  not measure screen paint, GPU work, real typing latency, or INP.
- Progress uses five events per note: start, diagram, code block, image, completion.
  Both variants flush DOM/layout after EVERY event. This is an update-heavy stress
  scenario, not the complete export duration. Real Svelte updates may batch.
- Heap deltas compare an empty document with a mounted 5000-note selector after
  explicit garbage collection, over fresh navigations. JavaScript heap excludes
  DOM/native allocations. CDP embedder heap is shown separately. Neither is total
  application RSS. The smaller JS heap alone must not be called a 95% RAM saving.
- All raw rounds are in [results.json](../scripts/benchmarks/svelte-comparison/results.json).

## Functional checks

- Browser assertions run for both variants: initial selection, all/none/diagrams,
  filtering, checkbox and keyboard toggles, rejection of empty exports, confirm,
  cancel, preview actions, statistics values, artifact escaping, pause/resume,
  cancellation token, completed rows, and CSS-presence checks.
- Existing suite: 230 tests pass across 21 files.
- Existing progress-store suite also runs against the transformed native store:
  6 tests pass, including completion and cancellation timers.
- TypeScript check passes. Production build passes.

## Assessment, not a measured fact

The native variant is smaller and faster in these local scenarios. The strongest
practical arguments are the roughly 74 KiB reduction in uncompressed plugin JS
and lower allocation cost for large dialogs. At 100 notes, the absolute UI gain
is only a few milliseconds.

This is NOT a framework-only comparison. Native note selection uses mutable Sets,
cached DOM rows, and filtered reattachment. The current Svelte view repeatedly
uses array membership checks inside its list and copies selection Sets. Native
progress uses plain state and targeted DOM updates instead of reactive proxies.
Those implementation choices contribute to the result. Optimizing the existing
Svelte implementation is a lower-risk alternative that is not benchmarked here.

The experiment supports considering a native implementation. It does not justify
an automatic production migration. It provides no measured improvement in image
processing, Markdown rendering, final HTML size, or complete export duration.

## Limits

- One machine and one Chrome version. No independent vendor benchmark claims.
- Headless Chrome is not Obsidian's Electron runtime.
- No real-vault end-to-end export, screenshot parity, accessibility audit,
  full modal lifecycle integration, or long-running leak test.
- Native views preserve the tested behavior, not pixel-identical presentation.
- The experimental adapter still reads original Svelte source at build time to
  preserve CSS and transform the progress store. Installed development dependencies
  are not removed. This is a runtime-free experiment, not a completed migration.

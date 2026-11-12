# Native UI benchmark and historical Svelte comparison

The runner now measures the production DOM views directly. There is no separate
experimental implementation, mount adapter, or state-source transformation.

The original comparison is preserved in [results.json](results.json) and
[the historical report](../../docs/svelte-comparison.md). It describes the
pre-migration Svelte build and an experimental native implementation. Do not
overwrite these samples with current production measurements.

Current samples are in [production-results.json](production-results.json).
See [the native UI documentation](../../docs/native-ui.md) for architecture,
current results, and limitations.

## Reproduce

Run from the repository root with existing pnpm dependencies and Google Chrome:

```sh
node benchmarks/svelte-comparison/run.mjs
pnpm test
pnpm type-check
pnpm build
```

`BENCH_ROUNDS` changes the measured round count (default 7). `CHROME` selects the
Chrome executable (default `/usr/bin/google-chrome`). The runner starts its own
loopback HTTP server and headless Chrome process. It stops both after the run.
Build output and browser profiles go to
`/tmp/opencode/obsidian-svelte-comparison/`, not `dist/`.

## Files

- `config.mjs`: loads the production Vite config with an isolated output directory.
- `build.mjs`: complete-plugin bundle metrics and Svelte module audit.
- `browser.ts`: scenarios and functional/CSS assertions against production views.
- `run.mjs`: serial rounds, Chrome CDP control, heap sampling, and raw results.

The runner needs a Node version with global `fetch` and `WebSocket` (tested on
Node 26.12.1). Headless Chrome is not Obsidian's Electron runtime. The archived
Svelte variant cannot be rerun from the migrated source tree; its source and
development dependencies have intentionally been removed.

# Changelog

# [0.7.0](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.6.10...0.7.0) (2026-07-07)


### Bug Fixes

* **export:** preserve external image src instead of replacing with placeholder ([6df5f88](https://github.com/fnumatic/obsidian-advanced-html-export/commit/6df5f886dc76fb70ba8e582633bdb408db5a0e41))
* **wiki-export:** add background to viewer image for transparent SVGs ([2097743](https://github.com/fnumatic/obsidian-advanced-html-export/commit/20977436e6922d6cc454416c5d6eab463caa908d))
* **wiki-export:** collect linked notes with BFS traversal ([9f58818](https://github.com/fnumatic/obsidian-advanced-html-export/commit/9f588181a5152508ba0521ee4e3762e9280c5c30))
* **wiki-export:** render unresolved wiki links as missing ([eb15c61](https://github.com/fnumatic/obsidian-advanced-html-export/commit/eb15c6115d229d84ba69a3f0b43c56b79d793e8c))
* **wiki-export:** scope zoom-in cursor to wiki-page only ([29598b7](https://github.com/fnumatic/obsidian-advanced-html-export/commit/29598b79eedc07e268bdb0074fffd698c3768eb4))
* **wiki-export:** update inline TOC on page navigation ([feb962e](https://github.com/fnumatic/obsidian-advanced-html-export/commit/feb962e3323a8e5f0d067e71942825b47533785c))


### Features

* **wiki-export:** add frontmatter reading, publish:false exclusion, and export manifest ([3102c35](https://github.com/fnumatic/obsidian-advanced-html-export/commit/3102c35e4fa9e88154f0bbad961b82bc25ca4fe0))
* **wiki-export:** add home icon button in wiki header ([187cd1f](https://github.com/fnumatic/obsidian-advanced-html-export/commit/187cd1fe146a139ad9a4620494b3edf1add69f27))
* **wiki-export:** add image viewer with zoom/pan for exported wiki pages ([1354ddd](https://github.com/fnumatic/obsidian-advanced-html-export/commit/1354ddd7c433a4a389c0ff7858297549899ef7e3))
* **wiki-export:** generate path-based slugs to prevent collisions ([b57a707](https://github.com/fnumatic/obsidian-advanced-html-export/commit/b57a70706ffcdff10c3ab93a3778fe563049fa9c))
* **wiki-export:** support all viewable file types as internal wiki pages ([990b27c](https://github.com/fnumatic/obsidian-advanced-html-export/commit/990b27cbcfb838e55576d5fb6861c440b10aa3e7))
* **wiki-export:** support excalidraw files as internal wiki pages ([b8fb759](https://github.com/fnumatic/obsidian-advanced-html-export/commit/b8fb759ef09d5d1ab533613bd101ed2de799216f))

## [0.6.10](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.6.9...0.6.10) (2026-07-06)


### Bug Fixes

* **build:** add esbuild as direct dependency for vite 8 ([2c0336e](https://github.com/fnumatic/obsidian-advanced-html-export/commit/2c0336e83a64e07eab730526845a5c07ca11ec1d))

## [0.6.9](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.6.8...0.6.9) (2026-07-06)


### Bug Fixes

* **deps:** pin codemirror versions to match obsidian peer deps ([bcb637f](https://github.com/fnumatic/obsidian-advanced-html-export/commit/bcb637f5b908e015b5bf7319957a1491c45bf4a3))

## [0.6.8](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.6.7...0.6.8) (2026-07-06)

## [0.6.7](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.6.6...0.6.7) (2026-07-06)

## [0.6.6](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.6.5...0.6.6) (2026-07-06)


### Bug Fixes

* address plugin review scanner issues ([9b6ceae](https://github.com/fnumatic/obsidian-advanced-html-export/commit/9b6ceaef7b558dfe5b8d48de9f4deb5fdfdf536c))

## [0.6.5](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.6.4...0.6.5) (2026-02-18)


### Bug Fixes

* apply sentence case to UI text and fix unawaited promises ([cc96441](https://github.com/fnumatic/obsidian-advanced-html-export/commit/cc96441d89a45814fc29604de2ceef9d6e1efe61))
* resolve remaining ESLint issues for Obsidian review ([6ba705a](https://github.com/fnumatic/obsidian-advanced-html-export/commit/6ba705ad437c557f876e4d8dce1648f87e4ff355))
* resolve TypeScript 'any' type errors for Obsidian plugin review ([3bb8b2e](https://github.com/fnumatic/obsidian-advanced-html-export/commit/3bb8b2eff2bc3a9b81074c0a48970b2d13d1e731))
* use setHeading() and move CSS to stylesheet ([9f18c29](https://github.com/fnumatic/obsidian-advanced-html-export/commit/9f18c29c1116008fa61123d6d89cf0186391e371))

## [0.6.4](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.6.3...0.6.4) (2026-02-16)

## [0.6.3](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.6.2...0.6.3) (2026-02-16)


### Bug Fixes

* **changelog:** correct 0.6.2 entries to match actual commits ([46da2ec](https://github.com/fnumatic/obsidian-advanced-html-export/commit/46da2ec0a488664eb64de79fd2e23c8662b1c672))


### Performance Improvements

* **htmlRenderer:** optimize image file lookup with cached map ([9855ea5](https://github.com/fnumatic/obsidian-advanced-html-export/commit/9855ea5bf342a7bc32126a1f6a84d19e29e5009e))

## [0.6.2](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.6.0...0.6.2) (2026-02-11)


### Bug Fixes

* **changelog:** remove duplicate version entries ([143f746](https://github.com/fnumatic/obsidian-advanced-html-export/commit/143f746076600ec4ab16215e36830699e17a0f0a))


### Refactor

* **refactor:** remove debug console.log statements ([381be0c](https://github.com/fnumatic/obsidian-advanced-html-export/commit/381be0c0fc4bf7e6743eb76d4a9f16ddb0a3a8e4))


# [0.6.0](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.3.0...0.6.0) (2026-02-11)


### Bug Fixes

* **icons:** add display properties for Carbon icons ([9655d9c](https://github.com/fnumatic/obsidian-advanced-html-export/commit/9655d9c76b5a588ef31261096088cae88244df66))
* pass custom syntax highlighting languages from settings to hideLanguageIdentifiers ([300f340](https://github.com/fnumatic/obsidian-advanced-html-export/commit/300f34011b36955709eae56a86be5f4932d3dd15))
* **progress:** fix progress bar updates not rendering in UI ([37d521c](https://github.com/fnumatic/obsidian-advanced-html-export/commit/37d521cc78a55667ae19cf9a2e1a3205f2090082))
* remove duplicate toggle buttons and ES module syntax errors ([14ec6a9](https://github.com/fnumatic/obsidian-advanced-html-export/commit/14ec6a9e7daeeea0a81c09d85e86b27bb125eb52))
* share imageCache between renderer and HTML generation in wiki export ([b05094f](https://github.com/fnumatic/obsidian-advanced-html-export/commit/b05094f6aea70523dea00101b61c20580af681e7))
* **svelte:** force browser resolution and output main.js for Obsidian ([4d775d8](https://github.com/fnumatic/obsidian-advanced-html-export/commit/4d775d8264708a8d8286065ae6a08cb2bacefcec))
* **ui:** align progress bar text to start in container ([8dddb22](https://github.com/fnumatic/obsidian-advanced-html-export/commit/8dddb22f6f44e2b6a7e64d54a95bf656d15e211a))
* **ui:** fix progress bar growing from center to left-to-right ([511e715](https://github.com/fnumatic/obsidian-advanced-html-export/commit/511e715aa11bc67a095ca47ee5501d7088fb6b37))
* **ui:** make Icon size reactive with $derived ([7814684](https://github.com/fnumatic/obsidian-advanced-html-export/commit/7814684137e9542bb1de2b0ad1e87c1b648a2505))
* **ui:** prevent jumping modal height during rendering preparation ([6c2f990](https://github.com/fnumatic/obsidian-advanced-html-export/commit/6c2f990bc8e3aeda0c352e1721165a52d701afea))
* **wiki-export:** handle headings with attributes in addHeadingIds regex ([8b5829f](https://github.com/fnumatic/obsidian-advanced-html-export/commit/8b5829fed64a87a7f7451ed7a0ad2d9eafe3fcce))


### Features

* **ui:** allow navigation back from note selection to preview ([07a4bb0](https://github.com/fnumatic/obsidian-advanced-html-export/commit/07a4bb04a22bd7faa44e21f7d4c3d6969f60eb3e))
* **ui:** migrate modals to Svelte 5 with Runes ([6b42b48](https://github.com/fnumatic/obsidian-advanced-html-export/commit/6b42b488ef988c435faa16c37f523dd84244fa8b))
* **wiki-export:** add detailed rendering progress with pause and cancel support ([148465e](https://github.com/fnumatic/obsidian-advanced-html-export/commit/148465eca88ce1943796c939811bd006e58a3be7))


# [0.3.0](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.2.0...0.3.0) (2026-02-03)

# [0.2.0](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.0.6...0.2.0) (2026-02-03)


### Features

* **wiki:** add bulk wiki export with single-page navigation UI ([51dccb5](https://github.com/fnumatic/obsidian-advanced-html-export/commit/51dccb5f6412f98c7925bab7d757a42b9fab9a5b))

# [0.1.0](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.0.6...0.1.0) (2026-02-03)


### Features

* **wiki:** add bulk wiki export with single-page navigation UI ([51dccb5](https://github.com/fnumatic/obsidian-advanced-html-export/commit/51dccb5f6412f98c7925bab7d757a42b9fab9a5b))

## [0.0.6](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.0.5...0.0.6) (2025-10-10)


### Features

* **img:** add image deduplication to reduce export file sizes ([19688ec](https://github.com/fnumatic/obsidian-advanced-html-export/commit/19688ecaf559beadbba4dc31e02e9bc82fb5d00b))
* **img:** add optional image deduplication with JavaScript embedding ([c5cb406](https://github.com/fnumatic/obsidian-advanced-html-export/commit/c5cb406e3b8165a03530a92eeb0d98457e3d119f))

## [0.0.5](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.0.4...0.0.5) (2025-10-10)


### Features

* **img:** add WebP support detection and fallback for image optimization ([ec50052](https://github.com/fnumatic/obsidian-advanced-html-export/commit/ec500525fd17da040a780a27288357e36ee12109))
* implement browser-only image optimization using Canvas API ([2336669](https://github.com/fnumatic/obsidian-advanced-html-export/commit/2336669674ab94e4c2101517a60d8c3e094ca686))

## [0.0.4](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.0.3...0.0.4) (2025-10-09)


### Bug Fixes

* **ci:** correct plugin name in workflow environments ([a167d4e](https://github.com/fnumatic/obsidian-advanced-html-export/commit/a167d4ec29bcd3817ec4b0ff608c9160115509be))

## [0.0.3](https://github.com/fnumatic/obsidian-advanced-html-export/compare/0.0.2...0.0.3) (2025-10-09)


### Bug Fixes

* **ci:** update beta workflow to use Node.js 22 and pnpm ([5949a5c](https://github.com/fnumatic/obsidian-advanced-html-export/commit/5949a5c026beb1093ceab0ba702a441f8170ec6f))

## 0.0.2 (2025-10-09)


### Features

* add single file HTML export ([dbe4b64](https://github.com/fnumatic/obsidian-advanced-html-export/commit/dbe4b64cfe545742ee69550be8f5dde5e3b34d32))
* implement enhanced build management ([def2ce6](https://github.com/fnumatic/obsidian-advanced-html-export/commit/def2ce6631a60bc246bf174dc723541bd5cf9d01))

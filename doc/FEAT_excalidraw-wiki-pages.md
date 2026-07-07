# Viewable File Wiki Page Support

## Goal

The wiki export should correctly handle two different Obsidian link types for
all viewable file types (images, excalidraw, etc.):

1. Viewable embeds:
   `![[diagram.excalidraw]]`, `![[image.png]]`, `![[photo.jpg]]`, `![[icon.svg]]`, etc.

2. Viewable files as internal wiki pages:
   `[[diagram.excalidraw]]`, `[[image.png]]`, `[[photo.webp]]`, etc.

These two cases must be handled separately because they mean different things.

## Desired Behavior

### Embed

`![[diagram.excalidraw]]`

- Rendered inline inside the current Markdown page.
- Not collected as a separate wiki page.
- Left unchanged during link resolving.
- Rendered through Obsidian's `MarkdownRenderer.render()`.
- Displayed by the Excalidraw plugin.

### Internal Wiki Link

`[[diagram.excalidraw]]`

- Treated as an internal wiki link.
- The `.excalidraw` file is collected as its own wiki page.
- The page appears in the wiki like a normal Markdown note.
- Opening the page shows the rendered Excalidraw drawing (same as embed).
- The page must not show raw Excalidraw JSON.

## Current Problem

The previous change added `.excalidraw` files directly to `vaultFiles`:

```ts
if (file.extension === 'md' || VIEWABLE_EXTENSIONS.includes(file.extension)) {
    this.vaultFiles.set(file.path, file);
    this.vaultFiles.set(file.basename, file);
}
```

This causes two issues.

### Problem 1: Embeds Are Collected Incorrectly

`extractLinks()` detects both wiki links and embeds. Because `collectLinkedNotes()` does not skip `image-embed` links, it calls `findFileByLink()` for embeds too. Before the change, `findFileByLink()` could not find `.excalidraw` files, so embeds were not collected. After the change, embeds are incorrectly collected as separate pages.

### Problem 2: Excalidraw Page Rendering Is Unreliable

The current implementation tries to read the `.excalidraw` file as JSON:

```ts
const svg = data.source || '';
```

Many Excalidraw files do not contain `data.source`, so the exported page becomes empty or broken.

## Supported Viewable Types

All types listed in `LinkResolver.VIEWABLE_EXTENSIONS`:

- Raster images: `jpg`, `jpeg`, `png`, `bmp`, `gif`, `webp`
- Vector images: `svg`
- Diagrams: `excalidraw` (also supports `.excalidraw.md`)

## Target Architecture

Markdown files and renderable non-Markdown files must be indexed separately.

### Markdown Files

```ts
private vaultFiles: Map<string, TFile> = new Map();
```

Contains only `.md` files.

### Viewable Files

```ts
private viewableFiles: Map<string, TFile> = new Map();
```

Contains all viewable file types (images + excalidraw), including `.excalidraw.md`.

## Link Metadata

`LinkInfo` must preserve the raw (un-slugified) target:

```ts
interface LinkInfo {
    original: string;
    target: string;
    rawTarget: string;
    alias: string;
    type: 'wiki' | 'markdown' | 'image-embed';
}
```

`rawTarget` is set from the original unmodified link text (e.g. `diagram.excalidraw`), while `target` remains the slugified version (e.g. `diagramexcalidraw`).

## Collection Rules

Embeds must be skipped explicitly in `collectLinkedNotes()`:

```ts
for (const link of links) {
    if (link.type === 'image-embed') {
        continue;
    }

    const targetFile = this.findFileByLink(link.rawTarget);
    // ...
}
```

This ensures `![[diagram.excalidraw]]`, `![[image.png]]`, etc. are never collected.

## File Resolution

`findFileByLink()` resolves files in three phases:

1. **Markdown files** — match by slugified basename without extension.
2. **Viewable files with extension** — match by slugified basename (e.g. `diagram.excalidraw` → slug matches `diagram.excalidraw` file, `image.png` → slug matches `image.png` file).
3. **Viewable files without extension** — fallback match when link has no extension (e.g. `diagram` → `diagram.excalidraw`, `logo` → `logo.svg`).

Markdown always takes priority over viewable files.

## Page Slugs

The wiki app navigates via `data-page`. The slug uses `LinkResolver.getFileSlug()`
which strips the `.excalidraw` suffix from the basename:

- `diagram.excalidraw` → `slugify('diagram')` → slug `diagram`
- `API Flow.excalidraw` → `slugify('api-flow')` → slug `api-flow`
- `diagram.excalidraw.md` → `slugify('diagram')` → slug `diagram`

## Link Resolving

`LinkResolver` gets an optional page slug resolver callback:

```ts
setPageSlugResolver(resolver: (rawTarget: string) => string | null): void
```

`resolveLinks()` uses it for wiki links:

```ts
const pageSlug = this.pageSlugResolver?.(link.rawTarget) ?? link.target;
```

This produces the correct `data-page` attribute for excalidraw wiki links.

## Viewable File Page Rendering

All viewable files are rendered through `readContentForPage()`, a shared helper
used by both `WikiHtmlRenderer.renderPageFromFile()` and
`DetailedWikiRenderer.renderPageWithProgress()`:

```ts
protected async readContentForPage(file: TFile): Promise<string> {
    if (LinkResolver.isViewableFile(file)) {
        return `![[${LinkResolver.getEmbedTarget(file)}]]`;
    }
    return this.app.vault.cachedRead(file);
}
```

`LinkResolver.isViewableFile()` checks both `VIEWABLE_EXTENSIONS` (image types
+ excalidraw) and the `.excalidraw.md` pattern.

`LinkResolver.getEmbedTarget()` returns:
- `diagram.excalidraw` → `diagram.excalidraw` (true `.excalidraw` file)
- `diagram.excalidraw.md` → `diagram.excalidraw` (basename without `.md`)
- `image.png` → `image.png` (`file.name`)

The synthetic embed is then processed by `MarkdownRenderer.render()` exactly
like a real inline embed, producing identical output.

Benefits:
- Same behavior as inline embeds.
- Excalidraw plugin handles rendering.
- Standard image types render as `<img>` tags.
- Works even when `data.source` is missing.

## Affected Files

| File | Changes |
|------|---------|
| `src/utils/linkResolver.ts` | `rawTarget` in `LinkInfo`; `pageSlugResolver`; `isExcalidrawFile()` static helper; `getFileSlug()`; `resolveLinks()` embed placeholder fix |
| `src/utils/wikiHtmlRenderer.ts` | Separate `viewableFiles`/`vaultFiles`; `.excalidraw.md` support; `readContentForPage()`; `renderWiki()` uses `getFileSlug` + `renderPageFromFile` |
| `src/utils/wikiExportOrchestrator.ts` | Same separation + slug corrections as `wikiHtmlRenderer.ts` |
| `src/utils/detailedRenderer.ts` | Uses `readContentForPage()` instead of direct `cachedRead` |
| `src/utils/excalidrawWikiExport.test.ts` | 16 pipeline tests covering `.excalidraw` and `.excalidraw.md` |

## Test Strategy

All 67 tests pass (44 original + 23 viewable-file-specific). See
`doc/TEST_EXCALIDRAW_WIKI_PAGES.md` for the full test plan.

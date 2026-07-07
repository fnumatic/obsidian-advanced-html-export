# Test Plan: Excalidraw Wiki Page Support

## Why the Previous Fix Failed

The implementation passed `pnpm type-check`, `pnpm test` (44/44), and `pnpm build`,
but the Excalidraw wiki pages were still broken in the real export.

### Root Causes

1. **Wrong render path patched**
   `WikiHtmlRenderer.renderPageFromFile()` was changed, but the real export uses
   `DetailedWikiRenderer.renderPageWithProgress()`. That method does its own
   file reading and renders directly, completely bypassing the override.

2. **Existing tests only cover isolated layers**
   - `LinkResolver.extractLinks()` — pure string manipulation
   - `LinkResolver.resolveLinks()` — string → anchor tag replacement
   - Simplified collect algorithms using `link.target` on in-memory maps
   - No test runs the real `WikiExportOrchestrator.collectNotes()` → then
     `DetailedWikiRenderer.renderPageWithProgress()` → then
     `generateWikiHtmlWithRenderedPages()` pipeline.

3. **Mock renderer is too generic**
   `MarkdownRenderer.render()` in the mock just sets
   `el.innerHTML = '<p>Mock rendered content</p>'`. It cannot simulate
   what happens when `![[diagram.excalidraw]]` hits a real Obsidian
   MarkdownRenderer with the Excalidraw plugin installed.

## Test Architecture

### Pipeline Tests

Test the full real flow end-to-end with a controlled fake vault.

```
collectNotes()
  → setSelectedNotes()
  → renderNotesWithProgress()
  → generateWikiHtmlWithRenderedPages()
```

For each test:
- Add mock files to the fake vault (both `.md` and `.excalidraw`)
- Set up `cachedRead()` to return the appropriate content
- Configure `MarkdownRenderer.render()` to produce realistic HTML
- Assert on the final rendered pages map and/or the final wiki HTML

### Isolated Unit Tests

Keep for fast feedback:
- `extractLinks()` distinguishes `![[diagram.excalidraw]]` (embed) from
  `[[diagram.excalidraw]]` (wiki) and preserves `rawTarget`
- `findFileByLink()` resolves `.excalidraw` files correctly
- page slug resolution produces `diagram` not `diagramexcalidraw`
- `resolveLinks()` replaces `[[diagram.excalidraw]]` with
  `data-page="diagram"`

## Test Cases

### A. Embed-only (no direct link)

**Vault files:**
| Path | Content |
|------|---------|
| `central.md` | `# Central\n\n![[diagram.excalidraw]]` |
| `diagram.excalidraw` | `{"source":"<svg ...>", "elements":[]}` |

**Expected:**
- `collectedFiles` length = 1 (only `central.md`)
- `diagram.excalidraw` is NOT collected
- Rendered central page contains the Excalidraw embed HTML (from mock)
- Final wiki HTML has exactly 1 page entry
- No `diagram` page in sidebar

### B. Direct-link only (no embed)

**Vault files:**
| Path | Content |
|------|---------|
| `central.md` | `# Central\n\n[[diagram.excalidraw]]` |
| `diagram.excalidraw` | `{"source":"<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='40'/></svg>", "elements":[]}` |

**Expected:**
- `collectedFiles` length = 2 (central + diagram)
- Rendered central page has `data-page="diagram"` anchor
- `page-diagram` div exists in final wiki HTML
- `page-diagram` inner HTML contains the rendered Excalidraw image
- `page-diagram` does NOT contain raw JSON

### C. Both embed and direct link

**Vault files:**
| Path | Content |
|------|---------|
| `central.md` | `# Central\n\n![[diagram.excalidraw]]\n\n[[diagram.excalidraw]]` |
| `diagram.excalidraw` | `{"source":"<svg>...</svg>", "elements":[]}` |

**Expected:**
- `collectedFiles` length = 2 (central + diagram)
- Emdedded image renders inline (same as A)
- Direct link creates exactly one page (same as B)
- No duplicate pages or broken slugs

### D. Excalidraw page rendering (detailed renderer)

**Vault files:**
| Path | Content |
|------|---------|
| `drawing.excalidraw` | `{"source":"<svg viewBox='0 0 200 200'><rect width='100' height='100'/></svg>", "elements":[]}` |

**Test:**
```ts
const html = await detailedRenderer.renderPageWithProgress(
    excalidrawFile, token, pauseController
)
```

**Expected:**
- The returned HTML contains rendered Excalidraw content
- The HTML is NOT raw JSON
- The HTML is NOT `<div class="excalidraw-error">`
- The HTML is NOT empty

### E. Direct link without `.excalidraw` extension

**Vault files:**
| Path | Content |
|------|---------|
| `central.md` | `# Central\n\n[[diagram]]` |
| `diagram.excalidraw` | `{"source":"<svg>...</svg>"}` |

**Expected:**
- If `diagram.md` does not exist, `[[diagram]]` resolves to `diagram.excalidraw`
- Slug is `diagram` (same as file basename)
- Final wiki HTML has `page-diagram`

### F. Extension collision: `.md` wins over `.excalidraw`

**Vault files:**
| Path | Content |
|------|---------|
| `central.md` | `# Central\n\n[[diagram]]` |
| `diagram.md` | `# Diagram note` |
| `diagram.excalidraw` | `{"source":"<svg>...</svg>"}` |

**Expected:**
- `[[diagram]]` resolves to `diagram.md`
- `diagram.excalidraw` is NOT collected
- No collision or broken behavior

### G. Slug does not contain dot/extension

**Test:**
```ts
const links = resolver.extractLinks('[[diagram.excalidraw]]');
const pageSlug = resolver.resolveLinks('[[diagram.excalidraw]]');
```

**Expected:**
- `link.target` = `diagramexcalidraw` (slugified with dot removed)
- `pageSlug` from resolver = `diagram` (basename-only)
- `data-page` in resolved content = `diagram`

### H. Excalidraw file with spaces and special chars

**Vault files:**
| Path | Content |
|------|---------|
| `central.md` | `# Central\n\n[[My Drawing.excalidraw]]` |
| `My Drawing.excalidraw` | `{"source":"<svg>...</svg>"}` |

**Expected:**
- Slug = `my-drawing`
- `data-page="my-drawing"`
- Page exists in wiki HTML

## Test Cases

### I. `.excalidraw.md` embed only

**Vault files:**
| Path | Content |
|------|---------|
| `central.md` | `# Central\n\n![[diagram.excalidraw]]` |
| `diagram.excalidraw.md` | `{"source":"<svg>...</svg>","elements":[]}` |

**Expected:**
- Only `central.md` collected (1 file)
- `.excalidraw.md` NOT collected from embed

### J. `.excalidraw.md` direct link

**Vault files:**
| Path | Content |
|------|---------|
| `central.md` | `# Central\n\n[[diagram.excalidraw]]` |
| `diagram.excalidraw.md` | `{"source":"<svg>...</svg>","elements":[]}` |

**Expected:**
- 2 files collected (central + diagram)
- Rendered page contains `<div class="excalidraw-embed">`, not raw JSON
- Slug is `diagram` not `diagramexcalidraw`
- Final HTML has `data-page="diagram"` and `id="page-diagram"`

## Current Test Status

| Check | Result |
|-------|--------|
| `pnpm type-check` | 0 errors |
| `pnpm test` | 60/60 pass |
| `pnpm build` | Produces valid main.js |
| Test file | `src/utils/excalidrawWikiExport.test.ts` (16 tests) |

## Implemented Fix Summary

### `src/utils/linkResolver.ts`

- `LinkResolver.isExcalidrawFile(file)` — detects both `.excalidraw` and `.excalidraw.md`
- `LinkResolver.getFileSlug(file)` — strips `.excalidraw` suffix for correct slugs
- `resolveLinks()` — embed placeholder pass prevents `[[x]]` substring collision with `![[x]]`

### `src/utils/wikiHtmlRenderer.ts`

- `initializeVaultFiles()` — `.excalidraw.md` files go to `viewableFiles`
- `readContentForPage()` — returns `` ![[embedTarget]] `` for excalidraw files
- `renderWiki()` — uses `getFileSlug()` and `renderPageFromFile()`

### `src/utils/wikiExportOrchestrator.ts`

- Same viewableFiles separation, slug corrections

### `src/utils/detailedRenderer.ts`

- `renderPageWithProgress()` uses `readContentForPage()` instead of direct `cachedRead`

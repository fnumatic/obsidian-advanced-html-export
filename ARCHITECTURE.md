# Architecture: Obsidian Advanced HTML Export

## 1. Overview

Obsidian plugin that exports notes as self-contained HTML files. Supports both single-note export and full wiki export (multi-note, recursively linked) as a single-page application (SPA) HTML file. Features image optimization (WebP), deduplication, lazy loading, and interactive rendering controls (cancel/pause/resume).

## 2. Directory Structure

```
.
├── src/
│   ├── main.ts                          # Plugin entry point + settings tab
│   ├── main.test.ts                     # Plugin instantiation tests
│   ├── styles.css                       # Minimal global plugin styles
│   ├── obsidian-ex.d.ts                 # Type augmentation for Obsidian
│   ├── commands/
│   │   ├── exportSingleFile.ts          # "Export current file as HTML" command
│   │   └── exportWiki.ts                # "Export wiki as HTML" command
│   ├── components/                      # Svelte 5 components
│   │   ├── types.ts                     # Shared type definitions
│   │   ├── CompletedNoteItem.svelte
│   │   ├── DetailRow.svelte
│   │   ├── ExportPreview.svelte
│   │   ├── Icon.svelte                  # Carbon icon wrapper (UnoCSS)
│   │   ├── NoteSelection.svelte
│   │   ├── ProgressBar.svelte
│   │   ├── RenderingProgress.svelte
│   │   └── TimeStats.svelte
│   ├── ui/
│   │   ├── components/
│   │   │   └── Button.svelte
│   │   ├── modals/                      # Bridge: Obsidian Modal → Svelte
│   │   │   ├── ExportPreviewModal.ts
│   │   │   ├── NoteSelectionModal.ts
│   │   │   └── RenderingProgressModal.ts
│   │   └── styles/
│   │       ├── obsidian-tokens.css
│   │       └── uno-shortcuts.css        # UnoCSS fallback CSS classes
│   ├── utils/
│   │   ├── htmlRenderer.ts              # Base HTML renderer
│   │   ├── htmlRenderer.test.ts
│   │   ├── wikiHtmlRenderer.ts          # Wiki-aware renderer (extends HtmlRenderer)
│   │   ├── wikiHtmlRenderer.test.ts
│   │   ├── detailedRenderer.ts          # Wiki renderer with progress events
│   │   ├── wikiExportOrchestrator.ts    # Multi-phase export pipeline
│   │   ├── wikiExport.test.ts           # Wiki export integration tests
│   │   ├── linkResolver.ts              # Wiki link extraction & resolution
│   │   ├── imageOptimizer.ts            # Canvas-based WebP optimization + hashing
│   │   ├── codeBlockProcessor.ts        # Syntax highlighting suppression
│   │   ├── cancellationToken.ts         # Cooperative cancellation
│   │   ├── pauseController.ts           # Pause/resume controller
│   │   ├── debugLogger.ts               # Singleton performance logger
│   │   ├── fileUtils.ts                 # downloadBlob, sanitizeFilename, etc.
│   │   ├── fileUtils.test.ts
│   │   ├── templateUtils.ts             # String interpolation {{VAR}}
│   │   └── wikiTemplates/               # SPA template assets (raw imports)
│   │       ├── template.html
│   │       ├── styles.css
│   │       ├── app.js
│   │       ├── helpers.js
│   │       └── signals.js
│   └── __mocks__/
│       ├── obsidian.ts                  # Full Obsidian API mock
│       └── virtual-uno.css              # Empty UnoCSS mock
├── doc/
│   ├── prd.md
│   └── FEAT_*.md                        # Feature specifications
├── testdata/
│   ├── testcase1/ ... testcase5/        # Wiki test fixtures (1-11 notes)
│   └── testimages/                      # Sample images
├── scripts/                             # Dev/build scripts (CJS)
├── package.json
├── vite.config.ts                       # Vite lib mode → CJS
├── vitest.config.ts
├── uno.config.ts                        # UnoCSS (Wind4 + Icons)
└── tsconfig.json                        # Strict TS
```

## 3. Architecture Layers

```
┌──────────────────────────────────────────────────────────────┐
│                  Plugin Entry Point (main.ts)                 │
│              AdvancedHtmlExportPlugin                         │
│  - loadSettings() / saveSettings()                            │
│  - registerCommands()                                         │
│  - addSettingTab()                                            │
├──────────────────────────────────────────────────────────────┤
│                   Commands Layer                              │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐ │
│  │ ExportSingleFileCommand │  │   ExportWikiCommand          │ │
│  │ exportSingleFile.ts     │  │   exportWiki.ts              │ │
│  └──────────┬──────────────┘  └──────────┬──────────────────┘ │
│             │                            │                    │
├─────────────┼────────────────────────────┼───────────────────┤
│             ▼                            ▼                    │
│        ┌──────────────────────────────────────────┐          │
│        │           Renderer Layer                  │          │
│        │                                           │          │
│        │  HtmlRenderer (base)                      │          │
│        │   └── WikiHtmlRenderer                    │          │
│        │        └── DetailedWikiRenderer           │          │
│        │                                           │          │
│        │  Responsibilities:                        │          │
│        │  - Markdown → HTML via Obsidian API       │          │
│        │  - Image processing (embed/optimize)      │          │
│        │  - Code block handling                    │          │
│        │  - Template filling                       │          │
│        └──────────────────────────────────────────┘          │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                           ▼                                  │
│        ┌──────────────────────────────────────────┐          │
│        │        Utility / Service Layer            │          │
│        │                                           │          │
│        │  ImageOptimizer  → WebP, SHA-256 hashing  │          │
│        │  LinkResolver    → [[Wiki Link]] parsing   │          │
│        │  CodeBlockProcessor → syntax hl control   │          │
│        │  CancellationToken → cooperative cancel   │          │
│        │  PauseController  → pause/resume          │          │
│        │  DebugLogger      → performance tracking  │          │
│        │  FileUtils        → download, filenames   │          │
│        │  TemplateUtils    → {{placeholder}} fill   │          │
│        └──────────────────────────────────────────┘          │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                           ▼                                  │
│        ┌──────────────────────────────────────────┐          │
│        │            UI Layer                       │          │
│        │                                           │          │
│        │  Modal Wrappers (TypeScript)              │          │
│        │   │ mount/unmount                         │          │
│        │   ▼                                       │          │
│        │  Svelte 5 Components (runes mode)         │          │
│        │  - ExportPreview, NoteSelection,          │          │
│        │    RenderingProgress                      │          │
│        └──────────────────────────────────────────┘          │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                           ▼                                  │
│        ┌──────────────────────────────────────────┐          │
│        │      Wiki Template Layer                  │          │
│        │  (src/utils/wikiTemplates/)               │          │
│        │                                           │          │
│        │  template.html  → HTML skeleton           │          │
│        │  styles.css     → Light/dark themes       │          │
│        │  app.js         → SPA routing + signals   │          │
│        │  helpers.js     → DOM utilities           │          │
│        │  signals.js     → Preact Signals impl     │          │
│        │                                           │          │
│        │  Imported as raw strings via `?raw`       │          │
│        └──────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────┘
```

## 4. Module Responsibilities

### 4.1 `src/main.ts` — Plugin Entry Point

- Extends Obsidian `Plugin`
- Loads/saves settings via `loadData()` / `saveData()`
- Registers two commands: single export, wiki export
- Defines settings tab inline via `PluginSettingTab`
- Settings: `imageQuality`, `enableLazyLoading`, `enableImageDeduplication`, `linkDepth`, `includeUnlinked`, `wikiTitle`, `enableThemeToggle`, `enableInlineTOC`, `defaultTheme`, `debugMode`, `disableSyntaxHighlighting`, `syntaxHighlightLanguages`

### 4.2 `src/commands/` — Command Execution

**`exportSingleFile.ts`:**
- Gets active file via `app.workspace.getActiveFile()`
- Creates `HtmlRenderer`, calls `render()`
- Triggers browser download via `downloadBlob()`

**`exportWiki.ts`:**
- Orchestrates multi-phase wiki export:
  1. **Collect**: `WikiExportOrchestrator.collectNotes()` — recursively collect linked notes
  2. **Preview**: `ExportPreviewModal` — show metrics
  3. **Select**: `NoteSelectionModal` — select notes
  4. **Render**: `DetailedWikiRenderer.renderPageWithProgress()` + event emitter
  5. **Assemble**: `generateWikiHtmlWithRenderedPages()` → assemble wiki HTML
- Supports Cancel (`CancellationToken`) and Pause/Resume (`PauseController`)

### 4.3 Renderer Chain (Class Hierarchy)

```
HtmlRenderer                         ← src/utils/htmlRenderer.ts
  └── WikiHtmlRenderer               ← src/utils/wikiHtmlRenderer.ts
        └── DetailedWikiRenderer     ← src/utils/detailedRenderer.ts
```

**`HtmlRenderer`** (base):
- `render(markdownContent, file, ctx)` → `Promise<string>` (HTML snippet)
- Image processing via `ImageOptimizer`
- Embedding strategies: deduplication vs direct base64
- Code block language handling via `CodeBlockProcessor`

**`WikiHtmlRenderer`** (extends HtmlRenderer):
- Adds wiki-aware features: link resolution, slug generation
- Template filling via `fillTemplate()`
- Extends `render()` with wiki-specific HTML wrapping

**`DetailedWikiRenderer`** (extends WikiHtmlRenderer):
- `renderPageWithProgress()` — emits granular `RenderEvent`s (Start, Progress, Complete)
- `generateWikiHtmlWithRenderedPages()` — assembles final wiki SPA HTML
- Supports cancellation and pause/resume
- Used by `RenderingProgressModal` for live UI updates

### 4.4 `src/utils/` — Service Layer

| File | Responsibility |
|---|---|
| `imageOptimizer.ts` | Canvas → WebP, SHA-256 hashing, dedup map |
| `linkResolver.ts` | `[[Wiki Link]]` extraction, alias support, recursive resolution |
| `codeBlockProcessor.ts` | Hide/restore language identifiers for syntax hl control |
| `cancellationToken.ts` | `CancellationToken` class — `isCancelled`, `onCancelled`, `throwIfCancelled()` |
| `pauseController.ts` | `PauseController` class — `pause()`, `resume()`, `waitIfPaused()` |
| `debugLogger.ts` | Singleton — phases, note timings, image metrics, JSON export |
| `fileUtils.ts` | `downloadBlob()`, `sanitizeFilename()`, `generateSafeFilename()` |
| `templateUtils.ts` | `fillTemplate(template, vars)` — `{{key}}` replacement |
| `wikiExportOrchestrator.ts` | Collect notes, analyze content, coordinate pipeline |

### 4.5 `src/components/` & `src/ui/` — UI Layer

**Bridge Pattern**: TypeScript wrapper classes (`*Modal.ts`) extend Obsidian's `Modal` class. They use Svelte 5's `mount()`/`unmount()` to attach/detach Svelte components to the modal's `contentEl`.

| Modal (TS) | Svelte Component | Purpose |
|---|---|---|
| `ExportPreviewModal` | `ExportPreview.svelte` | Shows note count, diagram/code/image stats |
| `NoteSelectionModal` | `NoteSelection.svelte` | Interactive note selection with search |
| `RenderingProgressModal` | `RenderingProgress.svelte` | Live progress bar, time stats, cancel/pause |

### 4.6 `src/utils/wikiTemplates/` — SPA Template Assets

Imported as raw strings via Vite's `?raw` query suffix:

- **`template.html`**: HTML skeleton with `{{title}}`, `{{sidebar}}`, `{{content}}` placeholders
- **`styles.css`**: Full light/dark theme, responsive design, sidebar, TOC styles
- **`app.js`**: SPA runtime — routing, history, signals, sidebar search, scroll spy
- **`helpers.js`**: `el()`, `els()` DOM helpers, theme toggle
- **`signals.js`**: Custom Preact Signals implementation (reactive state)

## 5. Dependency / Import Graph

```
main.ts
 ├── obsidian (external)
 ├── 'virtual:uno.css' (UnoCSS)
 ├── './styles.css'
 ├── './ui/styles/uno-shortcuts.css'
 ├── './ui/styles/obsidian-tokens.css'
 ├── commands/exportSingleFile.ts
 │    ├── obsidian
 │    ├── type main.ts (AdvancedHtmlExportPlugin)
 │    ├── utils/htmlRenderer.ts
 │    │    ├── obsidian (App, MarkdownRenderer, etc.)
 │    │    ├── utils/imageOptimizer.ts      ← standalone
 │    │    └── utils/codeBlockProcessor.ts   ← standalone
 │    └── utils/fileUtils.ts                 ← standalone
 └── commands/exportWiki.ts
      ├── obsidian
      ├── type main.ts
      ├── utils/wikiHtmlRenderer.ts
      │    ├── obsidian
      │    ├── utils/htmlRenderer.ts
      │    ├── utils/linkResolver.ts          ← standalone
      │    ├── utils/templateUtils.ts          ← standalone
      │    ├── utils/debugLogger.ts            ← standalone
      │    ├── utils/codeBlockProcessor.ts
      │    └── wikiTemplates/* (raw imports)
      ├── utils/wikiExportOrchestrator.ts
      │    ├── obsidian
      │    ├── utils/linkResolver.ts
      │    ├── utils/debugLogger.ts
      │    ├── utils/cancellationToken.ts      ← standalone
      │    ├── utils/pauseController.ts        ← standalone
      │    └── utils/detailedRenderer.ts
      │         ├── obsidian
      │         ├── utils/wikiHtmlRenderer.ts
      │         ├── utils/cancellationToken.ts
      │         ├── utils/pauseController.ts
      │         └── utils/codeBlockProcessor.ts
      ├── utils/detailedRenderer.ts
      ├── utils/fileUtils.ts
      ├── utils/debugLogger.ts
      ├── utils/cancellationToken.ts
      ├── utils/pauseController.ts
      ├── ui/modals/ExportPreviewModal.ts
      │    ├── obsidian (App, Modal)
      │    ├── svelte (mount, unmount)
      │    ├── components/ExportPreview.svelte
      │    └── utils/wikiExportOrchestrator.ts
      ├── ui/modals/NoteSelectionModal.ts
      │    ├── obsidian
      │    ├── svelte
      │    ├── components/NoteSelection.svelte
      │    └── utils/wikiExportOrchestrator.ts
      └── ui/modals/RenderingProgressModal.ts
           ├── obsidian
           ├── svelte
           ├── components/RenderingProgress.svelte
           ├── utils/wikiExportOrchestrator.ts
           ├── utils/cancellationToken.ts
           ├── utils/pauseController.ts
           └── utils/detailedRenderer.ts
```

## 6. Key Data Flows

### 6.1 Single File Export

```
User → Command Palette: "Export Current File as HTML"
  │
  ▼
ExportSingleFileCommand.execute()
  │
  ├── app.workspace.getActiveFile()        → TFile
  ├── app.vault.cachedRead(file)           → markdown string
  ├── new HtmlRenderer(app, pluginSettings)
  ├── renderer.render(markdown, file)
  │    ├── codeBlockProcessor.hideLanguageIdentifiers()
  │    ├── MarkdownRenderer.render()       → Obsidian HTML
  │    ├── ImageOptimizer.processImages()  → WebP base64 / dedup
  │    ├── codeBlockProcessor.restore()
  │    └── → HTML snippet
  ├── Wrap in HTML template + GitHub CSS
  └── fileUtils.downloadBlob(html, filename)
```

### 6.2 Wiki Export Pipeline (4 Phases)

```
Phase 1: COLLECT (Metadata Only)
  WikiExportOrchestrator.collectNotes(startFile, settings)
    → LinkResolver.findWikiLinks(content)
    → Recursively follow up to linkDepth
    → analyzeContent() for each note (diagrams, code, images, links)
    → NoteInfo[] (without rendered content)

Phase 2: PREVIEW
  ExportPreviewModal.show(NoteInfo[])
    → Sums: totalNotes, diagrams, codeBlocks, images
    → User sees metrics, clicks "Continue"

Phase 3: SELECT
  NoteSelectionModal.show(NoteInfo[])
    → User selects notes (search, bulk select, "with diagrams only")
    → NoteInfo[] (filtered)

Phase 4: RENDER
  DetailedWikiRenderer.renderPageWithProgress(notes, cancellationToken, pauseController)
    │
    ├── For each note:
    │    ├── Emit: RenderEvent.Start(note)
    │    ├── cancellationToken.throwIfCancelled()
    │    ├── pauseController.waitIfPaused()
    │    ├── render() → HTML snippet (like Single File)
    │    ├── Resolve [[Wiki Links]] → section IDs
    │    ├── Emit: RenderEvent.Progress(note, html)
    │    └── Emit: RenderEvent.Complete(note)
    │
    └── generateWikiHtmlWithRenderedPages()
         ├── fillTemplate(template.html, {title, sidebar, content})
         ├── Inject styles.css, app.js, helpers.js, signals.js
         └── → Final wiki SPA HTML
```

## 7. Design Patterns

| Pattern | Usage | Location |
|---|---|---|
| **Template Method** | Base class `HtmlRenderer.render()` with hook methods overridden by subclasses | `htmlRenderer.ts`, `wikiHtmlRenderer.ts`, `detailedRenderer.ts` |
| **Command Pattern** | Each export operation is encapsulated in a command class | `commands/exportSingleFile.ts`, `commands/exportWiki.ts` |
| **Strategy Pattern** | Image embedding: deduplication (hash map + JS restore) vs. direct base64 | `imageOptimizer.ts`, `htmlRenderer.ts` |
| **Orchestrator Pattern** | `WikiExportOrchestrator` manages the multi-phase pipeline (collect → analyze → select → render) | `wikiExportOrchestrator.ts` |
| **Bridge Pattern** | TypeScript Modal wrappers bridge Obsidian's class-based `Modal` API with Svelte's component model | `ui/modals/*.ts` ↔ `components/*.svelte` |
| **Observer / Event** | `DetailedWikiRenderer` emits `RenderEvent`s consumed by `RenderingProgress.svelte` for live UI | `detailedRenderer.ts`, `RenderingProgress.svelte` |
| **Cooperative Cancellation** | `CancellationToken` checked at multiple points for clean cancellation | `cancellationToken.ts`, renderer chain |
| **Singleton** | `DebugLogger` is module-level singleton shared across the app | `debugLogger.ts` |
| **Module-level State** | Preact Signals for reactive state in the generated SPA (not in the plugin itself) | `wikiTemplates/signals.js` |

## 8. Build & Configuration

### Tech Stack

| Component | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Build | Vite (lib mode, CJS output) |
| UI Framework | Svelte 5 (runes mode) |
| CSS Framework | UnoCSS (Wind4 preset + Carbon icons) |
| Test Runner | Vitest (node environment) |
| Package Manager | pnpm |

### Build Pipeline (`vite.config.ts`)

- **Entry**: `src/main.ts`
- **Output**: `dist/main.js` (CommonJS, for Obsidian compatibility)
- **Externals**: `obsidian`, `electron`, `codemirror*`, Node builtins
- **Sourcemaps**: disabled in production
- **CSS**: extracted to `dist/styles.css`
- **Virtual Module**: `virtual:uno.css` via UnoCSS plugin

### Key Scripts (`package.json`)

| Command | Purpose |
|---|---|
| `pnpm dev` | Interactive dev mode (vault selection + watch) |
| `pnpm build` | Production build: `vite build && cp manifest.json dist/` |
| `pnpm test` | `vitest run` |
| `pnpm test:watch` | `vitest` (watch mode) |
| `pnpm type-check` | `tsc --noEmit` |
| `pnpm release` | Automated release with changelog |

### TypeScript Configuration (`tsconfig.json`)

- Target: ES6, Module: ESNext, ModuleResolution: bundler
- `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters` — strict
- Includes both `.ts` and `.svelte` files

## 9. Testing Strategy

### Framework: Vitest

- **Environment**: `node`
- **Globals**: enabled
- **Mock alias**: `obsidian` → `src/__mocks__/obsidian.ts`

### Mock Strategy

- **`src/__mocks__/obsidian.ts`**: Mocks `Plugin`, `Modal`, `Notice`, `TFile`, `App`, `MarkdownRenderer`, `PluginSettingTab`, `Setting`, etc.
- **`src/__mocks__/virtual-uno.css`**: Empty mock for the UnoCSS virtual module
- Test files use `vi.mock()` for Obsidian and `vi.importActual()` to preserve some real implementations

### Test Files

| File | Tests | Scope |
|---|---|---|
| `main.test.ts` | 2 | Plugin instantiation + onload |
| `fileUtils.test.ts` | 10 | `downloadBlob`, `sanitizeFilename`, `generateSafeFilename` |
| `htmlRenderer.test.ts` | 8 | Render modes, image caching, error fallback, copy-code removal |
| `wikiExport.test.ts` | 12 | LinkResolver, aliases, recursive collection, depth, circular refs, slugs, HTML structure |
| `wikiHtmlRenderer.test.ts` | 9 | Link extraction, slugs, HTML resolution, file discovery, depth, circular refs, testcase5 |

### Test Data (`testdata/`)

- **testcase1**: 1 note + 1 image
- **testcase2**: 2 notes + 2 images + subfolder
- **testcase3**: 3 notes + 3 images + subfolders
- **testcase4**: Master/sub notes + nested folders
- **testcase5**: 11 notes, 5 level-1 + 5 level-2, SVG images, complex cross-references

## 10. Naming Conventions & Code Style

### Imports

```typescript
// External first, then relative
import { App, Plugin, Modal } from 'obsidian';
import { mount, unmount } from 'svelte';
import './styles.css';
import { HtmlRenderer } from './utils/htmlRenderer';
```

### Naming

| Construct | Convention | Example |
|---|---|---|
| Variables, Functions | `camelCase` | `imageQuality`, `generateSafeFilename` |
| Classes, Interfaces | `PascalCase` | `HtmlRenderer`, `AdvancedHtmlExportSettings` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_SETTINGS`, `IMAGE_EXTENSIONS` |
| Files | `kebab-case` | `html-renderer.ts`, `export-single-file.ts` |

### Code Patterns

- Semicolons required
- Arrow functions preferred
- Optional chaining (`?.`) and nullish coalescing (`??`)
- Early returns to reduce nesting
- Explicit type annotations on parameters and return types
- No `any` — prefer `unknown` with type guards
- Defensive null checks before property access
- Empty collections over `null`

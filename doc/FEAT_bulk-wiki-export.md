# Feature Document: Bulk Wiki Export

## Overview

Add the ability to export an entire wiki of interconnected Obsidian notes as a single, self-contained HTML file (mini-wiki). Users can select a central document, and all recursively linked notes will be exported into one HTML file with **single-page navigation** - only the current note is visible, and clicking links switches to the target note.

**Key Features:**
- Single HTML file with multiple note sections
- **Single-page navigation**: Only current note visible at a time
- **Sidebar**: List of all pages for quick access
- **Browser history**: Back/forward buttons work within the wiki
- **Breadcrumb navigation**: Shows current path (Home > Related > Current)
- **Search**: Filter sidebar pages by name
- **Efficient images**: Global deduplication across all notes

**Status:** Planned | **Priority:** High | **Est. Effort:** ~18 hours

---

## 1. Problem Statement

The current plugin only exports a single note at a time. Users who maintain interconnected knowledge bases need to share or archive their entire wiki structure as a single, navigable HTML document.

**Pain Points:**
- Exporting multiple linked notes requires manual effort for each file
- No way to preserve the interconnected structure of notes in HTML export
- Users cannot share their entire knowledge base as one portable document

---

## 2. Goals

- Export a central note plus all recursively linked notes into a single HTML file
- Maintain efficient image handling (deduplication, optimization)
- Provide seamless navigation within the exported wiki via internal links
- Integrate with existing export settings (image quality, lazy loading, deduplication)
- Add a toggle in settings to switch between single-file and bulk export modes

---

## 3. User Stories

| Priority | User Story | Acceptance Criteria |
|----------|------------|---------------------|
| P0 | As a user, I want to trigger the wiki export from the current note | "Export Wiki as HTML" command exports current note + all linked notes |
| P0 | As a user, I want internal wiki links to become clickable navigation links | [[Page Name]] and [Markdown links](page.md) switch to target note when clicked |
| P0 | As a user, I want to see only one note at a time | Only the current note is visible; other notes are hidden |
| P1 | As a user, I want images across all exported notes to be deduplicated and optimized | Identical images embedded once; all images optimized to WebP |
| P1 | As a user, I want to choose between single-file export and bulk wiki export in settings | Settings dropdown allows switching between modes |
| P1 | As a user, I want a sidebar with all exported notes for quick navigation | Clicking a note in sidebar shows that note |
| P1 | As a user, I want back/forward navigation (like browser history) | Browser back/forward buttons work within the wiki |
| P1 | As a user, I want breadcrumb navigation to see my path | Breadcrumbs show: Home > Related > Current |
| P1 | As a user, I want to search within the exported wiki | Search box filters/finds notes |
| P2 | As a user, I want a progress indicator during bulk export | Progress notice shows current/total notes being processed |
| P2 | As a user, I want to configure link depth (how many levels of links to include) | Settings input allows link depth from 1-10 or unlimited |

---

## 4. Functional Requirements

### 4.1 Export Modes (Settings)

Add new settings to the existing settings interface:

```typescript
interface BulkExportSettings {
  exportMode: 'single' | 'bulk';    // Default: 'single'
  linkDepth: number;                 // Default: 1 (direct links only)
  includeUnlinked: boolean;          // Default: false
  wikiTitle: string;                 // Default: '' (use central note title)
  enableToc: boolean;               // Default: true (generate table of contents)
}
```

### 4.2 New Command

| Command ID | Name | Description |
|------------|------|-------------|
| `export-wiki-as-html` | Export Wiki as HTML | Export current note with all recursively linked notes as a single-page HTML wiki |

**Behavior:**
1. Uses the currently open note as the central/start note
2. Collects all recursively linked notes (up to `linkDepth`)
3. Exports as single HTML file
4. Initial view: Central note is displayed
5. Sidebar shows all exported notes for navigation

**Settings Dependencies:**
- `linkDepth`: How many link levels to include (default: 1)
- `imageQuality`, `enableLazyLoading`, `enableImageDeduplication`: Inherited from existing settings

### 4.3 Link Resolution and Navigation

**Link Formats to Handle:**
- Wiki links: `[[Page Name]]`, `[[Page Name\|Alias]]`
- Markdown links: `[Alias](path/to/note.md)`
- Relative links: `[Alias](./path/note.md)`, `[Alias](../path/note.md)`

**Output Format:**
- Convert internal links to JavaScript navigation: `<a href="#" data-page="slug">Alias</a>`
- Each note rendered as `<section id="page-slug" class="wiki-page">`
- Sidebar lists all notes for quick access
- Browser history integrated via `pushState`

### 4.4 Image Handling

**Requirements:**
- Shared `imageCache` across all rendered notes (currently per-instance)
- Global deduplication across entire wiki export
- Maintain existing optimization pipeline (WebP conversion, quality settings)
- Lazy loading applies to all images

### 4.5 Output HTML Structure (Single-Page Wiki)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${wikiTitle}</title>
    <style>
        /* Existing GitHub Markdown CSS */
        /* Wiki-specific styles */
        .wiki-container { display: flex; min-height: 100vh; }
        .wiki-sidebar { width: 250px; background: #f6f8fa; border-right: 1px solid #d1d9e0; padding: 20px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
        .wiki-content { flex: 1; padding: 40px; max-width: 900px; }
        .wiki-page { display: none; }
        .wiki-page.active { display: block; }
        .wiki-nav { display: flex; gap: 8px; margin-bottom: 20px; }
        .wiki-nav button { padding: 8px 16px; cursor: pointer; }
        .wiki-breadcrumb { font-size: 14px; color: #656d76; margin-bottom: 20px; }
        .wiki-breadcrumb a { color: #0969da; text-decoration: none; }
        .wiki-breadcrumb a:hover { text-decoration: underline; }
        .wiki-search { width: 100%; padding: 8px; margin-bottom: 16px; border: 1px solid #d1d9e0; border-radius: 6px; }
        .wiki-toc { margin-bottom: 24px; }
        .wiki-toc ul { list-style: none; padding: 0; }
        .wiki-toc li { margin: 8px 0; }
        .wiki-toc a { color: #24292f; text-decoration: none; }
        .wiki-toc a:hover { color: #0969da; }
        .wiki-toc a.active { color: #0969da; font-weight: 600; }
        .wiki-backlinks { margin-top: 40px; padding-top: 20px; border-top: 1px solid #d1d9e0; }
    </style>
</head>
<body>
    <div class="wiki-container">
        <aside class="wiki-sidebar">
            <div class="wiki-search">
                <input type="text" id="wiki-search-input" placeholder="Search notes...">
            </div>
            <nav class="wiki-toc">
                <h3>Contents</h3>
                <ul id="wiki-page-list"><!-- All pages --></ul>
            </nav>
        </aside>
        
        <main class="wiki-content">
            <!-- Breadcrumb Navigation -->
            <div class="wiki-breadcrumb" id="wiki-breadcrumb">
                <a href="#" data-page="central">Home</a>
            </div>
            
            <!-- Back/Forward Navigation -->
            <div class="wiki-nav">
                <button id="wiki-back" disabled>← Back</button>
                <button id="wiki-forward" disabled>Forward →</button>
            </div>
            
            <!-- Notes (only one visible at a time) -->
            <section id="page-central" class="wiki-page active" data-title="Home">
                <!-- Central note content -->
            </section>
            
            <section id="page-note-1" class="wiki-page" data-title="Related Note 1">
                <!-- Linked note content -->
            </section>
            
            <section id="page-note-2" class="wiki-page" data-title="Related Note 2">
                <!-- Linked note content -->
            </section>
            
            <!-- Additional pages... -->
        </main>
    </div>
    
    <script>
        // Wiki Navigation State
        const wikiState = {
            currentPage: 'central',
            history: [],
            pages: ${JSON.stringify(pageList)}
        };
        
        // Navigation: Show specific page
        function wikiShowPage(slug) {
            // Hide all pages, show target
            document.querySelectorAll('.wiki-page').forEach(p => p.classList.remove('active'));
            const target = document.getElementById('page-' + slug);
            if (target) {
                target.classList.add('active');
                wikiState.currentPage = slug;
                wikiState.history.push(slug);
                updateBreadcrumb(slug);
                updateNavButtons();
            }
        }
        
        // Update breadcrumb
        function updateBreadcrumb(slug) {
            const page = wikiState.pages.find(p => p.slug === slug);
            const bc = document.getElementById('wiki-breadcrumb');
            bc.innerHTML = `<a href="#" data-page="central">Home</a> ${page ? ' > ' + page.title : ''}`;
        }
        
        // Back/Forward navigation
        function wikiBack() {
            if (wikiState.history.length > 1) {
                wikiState.history.pop();
                const prev = wikiState.history[wikiState.history.length - 1];
                wikiShowPage(prev);
            }
        }
        
        function wikiForward() { /* implementation */ }
        
        function updateNavButtons() {
            document.getElementById('wiki-back').disabled = wikiState.history.length <= 1;
            document.getElementById('wiki-forward').disabled = true;
        }
        
        // Search functionality
        document.getElementById('wiki-search-input').addEventListener('input', function(e) {
            const query = e.target.value.toLowerCase();
            const list = document.getElementById('wiki-page-list');
            list.querySelectorAll('li').forEach(li => {
                const match = li.textContent.toLowerCase().includes(query);
                li.style.display = match ? 'block' : 'none';
            });
        });
        
        // Convert links to navigation
        document.querySelectorAll('.wiki-page a[data-page]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                wikiShowPage(link.dataset.page);
            });
        });
        
        // Browser back/forward support
        window.addEventListener('popstate', e => {
            if (e.state && e.state.slug) {
                wikiShowPage(e.state.slug);
            }
        });
        
        // Initialize history with starting page
        history.replaceState({slug: 'central'}, '', '#central');
    </script>
</body>
</html>
```

---

## 5. Technical Architecture

### 5.1 New Files Structure

```
src/
├── commands/
│   ├── exportSingleFile.ts      # Existing - keep as-is
│   └── exportWiki.ts            # NEW - Bulk wiki export command
├── utils/
│   ├── htmlRenderer.ts           # Existing - refactor shared logic
│   ├── imageOptimizer.ts         # Existing - keep as-is
│   ├── fileUtils.ts             # Existing - keep as-is
│   ├── linkResolver.ts          # NEW - Parse and resolve internal links
│   └── wikiHtmlRenderer.ts      # NEW - Extended renderer for wiki export
├── main.ts                      # Modify - Add bulk settings and commands
└── styles.css                   # Modify - Add wiki-specific styles
```

### 5.2 New Classes

#### 5.2.1 LinkResolver (utils/linkResolver.ts)

```typescript
interface LinkInfo {
  original: string;       // [[Page Name]] or [Alias](path.md)
  target: string;         // Page slug for anchor
  alias: string;        // Display text
  type: 'wiki' | 'markdown';
}

class LinkResolver {
  resolveLinks(content: string): { content: string; links: LinkInfo[] };
  extractLinks(content: string): LinkInfo[];
  resolvePath(linkTarget: string, basePath: string): string;
  slugify(title: string): string;
}
```

#### 5.2.2 WikiHtmlRenderer (utils/wikiHtmlRenderer.ts)

```typescript
interface WikiRenderOptions {
  imageQuality: 'high' | 'medium' | 'low';
  enableLazyLoading: boolean;
  enableImageDeduplication: boolean;
  linkDepth: number;
  includeUnlinked: boolean;
}

interface PageInfo {
  slug: string;
  title: string;
  file: TFile;
  links: string[];  // Slugs of linked pages
}

class WikiHtmlRenderer {
  imageCache: Map<string, string>;     // Shared across all notes
  renderedPages: Map<string, string>;  // slug -> HTML
  pageList: PageInfo[];                 // All exported pages
  
  async renderWiki(centralNote: TFile, options: WikiRenderOptions): Promise<string>;
  private async collectLinkedNotes(file: TFile, depth: number, visited: Set<string>): Promise<TFile[]>;
  private async renderPage(file: TFile): Promise<string>;
  private generatePageList(): string;
  private generateBreadcrumb(currentSlug: string): string;
}
```

#### 5.2.3 ExportWikiCommand (commands/exportWiki.ts)

```typescript
class ExportWikiCommand {
  constructor(app: App, plugin: AdvancedHtmlExportPlugin);
  execute(): Promise<void>;
  private async executeWithFile(file: TFile): Promise<void>;
  private showProgress(current: number, total: number): void;
}
```

### 5.3 Data Flow

```
User triggers "Export Wiki as HTML"
         ↓
Get currently open file as central note
         ↓
Collect all linked notes recursively (up to linkDepth)
         ↓
Create WikiHtmlRenderer with shared imageCache
         ↓
Render each note as separate <section id="slug" class="wiki-page">
         ↓
Convert internal links to JavaScript navigation (data-page attribute)
         ↓
Generate page list for sidebar navigation
         ↓
Generate breadcrumb structure
         ↓
Embed navigation JavaScript (showPage, history, search)
         ↓
Download as single HTML file (starts at central note)

---

## 6. Implementation Plan

### Phase 1: Core Infrastructure (Day 1)

1. **Extract link resolution logic**
   - Create `LinkResolver` class
   - Handle `[[wiki links]]` and markdown links
   - Convert to anchor format

2. **Modify HtmlRenderer for shared cache**
   - Add optional `sharedImageCache` parameter
   - Refactor to support external cache injection

3. **Create WikiHtmlRenderer class**
   - Inherit/extensible from base `HtmlRenderer`
   - Implement recursive note collection
   - Implement shared image deduplication

### Phase 2: Export Command (Day 2)

1. **Add bulk export settings**
   - Extend `AdvancedHtmlExportSettings`
   - Add new UI controls in `AdvancedHtmlExportSettingTab`
   - Add new commands in `main.ts`

2. **Create ExportWikiCommand**
   - Implement note collection
   - Implement progress notifications
   - Handle edge cases (broken links, missing files)

3. **Implement HTML generation**
   - Add wiki-specific CSS
   - Generate navigation sidebar
   - Generate TOC

### Phase 3: Polish (Day 3)

1. **Add configuration options**
   - Link depth settings
   - Custom wiki title
   - TOC visibility

2. **Improve UX**
   - Better progress indication
   - Error handling for broken links
   - Cancel option during export

3. **Testing**
   - Test with complex link structures
   - Test image deduplication across notes
   - Test various link depth configurations

---

## 7. API / Hooks

### Obsidian APIs Used

| API | Purpose |
|-----|---------|
| `app.workspace.getActiveFile()` | Get current file |
| `app.vault.getFiles()` | Enumerate vault files |
| `app.vault.cachedRead(file)` | Read file content |
| `MarkdownRenderer.render()` | Convert markdown to HTML |
| `TFile` | File interface for note operations |

### New Dependencies

**None.** All functionality can be built with existing APIs.

---

## 8. Settings Migration

**New Default Settings:**

```typescript
const DEFAULT_SETTINGS: AdvancedHtmlExportSettings = {
  // Existing
  imageQuality: 'medium',
  enableLazyLoading: true,
  enableImageDeduplication: true,
  // New
  exportMode: 'single',
  linkDepth: 1,
  includeUnlinked: false,
  wikiTitle: '',
  enableToc: true
}
```

**Migration:** No migration needed - new settings get default values.

---

## 9. Compatibility

| Aspect | Requirement |
|--------|-------------|
| Obsidian version | 1.10.0+ (existing requirement) |
| Node version | 14+ (existing requirement) |
| Browser support | Same as existing HTML exports |
| Mobile support | Responsive CSS included |

---

## 10. Files to Modify

| File | Change |
|------|--------|
| `src/main.ts` | Add bulk settings, register new commands |
| `src/commands/exportWiki.ts` | NEW - Wiki export command |
| `src/utils/linkResolver.ts` | NEW - Link parsing and resolution |
| `src/utils/wikiHtmlRenderer.ts` | NEW - Wiki-specific rendering |
| `src/utils/htmlRenderer.ts` | Refactor for shared cache support |
| `src/styles.css` | Add wiki navigation styles |

---

## 11. Estimated Effort

| Task | Estimated Time |
|------|----------------|
| LinkResolver implementation | 2 hours |
| HtmlRenderer refactor (shared cache) | 1 hour |
| WikiHtmlRenderer implementation (SPA navigation) | 5 hours |
| Navigation JavaScript (history, breadcrumbs, search) | 2 hours |
| ExportWikiCommand implementation | 2 hours |
| Settings UI updates | 2 hours |
| CSS styling (sidebar, navigation) | 1 hour |
| Testing & polish | 3 hours |
| **Total** | **~18 hours** |

---

## 12. Testing Plan

### Unit Tests
- LinkResolver: Parse wiki links, markdown links, relative paths
- WikiHtmlRenderer: Note collection, TOC generation, image cache sharing
- ExportWikiCommand: Progress notifications, error handling

### Integration Tests
- Export vault with 5-10 linked notes
- Verify all links work as anchors
- Verify image deduplication across notes
- Test different link depth values

### Performance Tests
- Export vault with 50+ notes
- Measure export time and memory usage
- Verify async processing doesn't block UI

---

## 13. Success Criteria

- [ ] User can export central note + all linked notes as single HTML
- [ ] Only the current note is visible at a time
- [ ] Clicking internal links navigates to target note
- [ ] Back/forward browser buttons work within the wiki
- [ ] Sidebar shows list of all pages for quick navigation
- [ ] Breadcrumb navigation shows current path
- [ ] Search box filters sidebar list
- [ ] Images are deduplicated across entire wiki
- [ ] Settings toggle switches between single/bulk export
- [ ] Export completes without errors on test vault with 50+ notes
- [ ] Existing single-file export continues to work

---

## 14. Open Questions

| Question | Options | Recommendation |
|----------|---------|----------------|
| Link resolution strategy | A: Only export existing notes / B: Placeholder for broken links | A with warning |
| Image deduplication scope | A: Global / B: Per-section | A (already partially implemented) |
| Navigation sidebar behavior | A: Fixed / B: Collapsible / C: TOC only | A for simplicity |
| Backlink support | Include / Defer | Defer to future release |
| Link depth 0 meaning | Unlimited / No links | 0 = unlimited |

---

## 15. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Circular links cause infinite loop | High | Track visited files during collection |
| Large vaults cause memory issues | Medium | Process notes asynchronously, limit cache size |
| Complex markdown breaks renderer | Medium | Use existing MarkdownRenderer, add error boundaries |
| Performance with 100+ notes | Low | Add progress updates, consider streaming |

---

## 16. Future Enhancements (Out of Scope)

- Backlinks section showing which notes link to current note
- Export as folder with multiple HTML files
- Custom CSS themes
- Password protection for exported wiki
- Export to PDF from HTML

---

## 17. References

- Existing single-file export: `src/commands/exportSingleFile.ts`
- Existing HTML renderer: `src/utils/htmlRenderer.ts`
- Existing image optimizer: `src/utils/imageOptimizer.ts`
- Settings implementation: `src/main.ts`

---

*Document Version: 2.1*
*Created: 2026-02-03*
*Updated: 2026-02-03*
*Note: Single command approach - exports from currently open note*

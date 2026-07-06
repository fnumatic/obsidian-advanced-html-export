# Development Roadmap

## Current Position

The plugin exports Obsidian notes as self-contained HTML files and sits between three product categories:

1. **Portable HTML Export** — One file, everything embedded, good for sharing and archiving
2. **Mini Obsidian Publish Replacement** — Sidebar, search, TOC, Wiki-links, theme toggle
3. **Selfhosting Wiki Generator** — Needs structural features: multiple files, stable URLs, `index.html`, asset folder, sitemap, search index

Strongest differentiator: The plugin uses Obsidian's own `MarkdownRenderer` and exports the actual rendered DOM (including Dataview, Kanban, Excalidraw), not raw Markdown. This sets it apart from pure Markdown→HTML converters.

## Validated Weak Points

| Issue | Location | Details |
|---|---|---|
| Incomplete link traversal | `wikiExportOrchestrator.ts:402-446` | `collectLinkedNotes()` only collects up to depth 2, no real recursion/queue — `linkDepth` setting up to 10 is not fully utilized |
| `notesByDepth` empty | `wikiExportOrchestrator.ts:380` | `ExportMetrics` `Map` initialized but never populated |
| Slug collision | `wikiExportOrchestrator.ts:138` | `slugify(file.basename)` ignores path — two files with the same name in different folders collide |
| No frontmatter support | entire codebase | `title`, `publish: false`, `aliases` from frontmatter are ignored |
| Incomplete wiki-link regex | `linkResolver.ts:35` | Only supports `[[target]]` and `[[target\|alias]]`, not `[[Note#Heading]]`, `[[Note^blockid]]` |
| Hardcoded theme values | `wikiTemplates/styles.css` | Uses `#ffffff`, `#37352f`, `#0066cc` instead of CSS variable adapter |

---

## Phase 1: Stabilize Single-HTML Wiki

Priority: Make the existing export mode more robust without changing the architecture.

### 1.1 Proper BFS Link Traversal

`collectLinkedNotes()` currently only collects two levels deep. Replace with a proper BFS queue:

```ts
async function collectLinkedNotes(root: TFile, maxDepth: number): Promise<TFile[]> {
  const visited = new Set<string>();
  const queue: Array<{ file: TFile; depth: number }> = [{ file: root, depth: 0 }];
  const result: TFile[] = [];

  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;
    if (visited.has(file.path)) continue;
    visited.add(file.path);
    result.push(file);
    if (depth >= maxDepth) continue;

    const content = await app.vault.cachedRead(file);
    const links = linkResolver.extractLinks(content);

    for (const link of links) {
      const target = findFileByLink(link.target);
      if (target && !visited.has(target.path)) {
        queue.push({ file: target, depth: depth + 1 });
      }
    }
  }
  return result;
}
```

This also makes `notesByDepth` properly fillable: `notesByDepth.set(depth, (notesByDepth.get(depth) ?? 0) + 1)`.

### 1.2 Path-based Slugs

Generate slug from `file.path` instead of `file.basename`:

```ts
slug: slugify(file.path.replace(/\.md$/, ''))
```

Example:
- `Projects/Foo/README.md` → `projects/foo/readme`
- `Projects/Bar/README.md` → `projects/bar/readme`

The `vaultFiles` map should only use `file.path` as key, not additionally `file.basename`.

### 1.3 Detect Missing Links

In `LinkResolver`, `findFileByLink()` should distinguish between found and missing targets:

```ts
type ResolvedLink = {
  target: string;
  alias: string;
  resolved: boolean;
  targetPath?: string;
};
```

Missing links could be visually marked in the wiki HTML (e.g., red text, like Obsidian itself).

### 1.4 Read Frontmatter

At minimum these frontmatter fields should be parsed by the orchestrator:

```ts
interface PageFrontmatter {
  title?: string;       // Overrides file.basename
  publish?: boolean;    // false → exclude from export
  aliases?: string[];   // Alternative access paths to the page
  tags?: string[];      // For tag index (Phase 4)
}
```

`NoteInfo` gets a `frontmatter` field, title is derived from `frontmatter.title ?? file.basename`.

### 1.5 Generate Backlinks

After collecting all pages, iterate backwards through links and build a `backlinks: NoteInfo[]` list per page. Backlinks could be displayed at the bottom of each page in the wiki HTML.

### 1.6 Export Manifest

Embed a metadata block into the HTML file:

```json
<script id="export-manifest" type="application/json">
{
  "version": "0.6.5",
  "mode": "single-html",
  "root": "Home.md",
  "pages": ["home", "projects/foo", "projects/bar"],
  "generatedAt": "2026-07-06T00:00:00.000Z"
}
</script>
```

---

## Phase 2: Static Site Mode

Introduce a second export mode alongside the existing single HTML mode. This generates a folder with one file per page and asset files.

### 2.1 Directory Structure

```
dist/
  index.html              # Entry page (e.g., root note)
  assets/
    app.js                # SPA logic (shared with single HTML mode)
    styles.css            # CSS (shared)
    images/               # Optimized images
      hash-webp/          # Deduplicated images
  pages/
    index.html            # Root page
    projects/
      foo/
        index.html        # Clean URL: /projects/foo
      bar/
        index.html
  search-index.json       # Full-text index
  sitemap.xml             # For SEO
  graph.json              # Nodes/edges for graph view
```

### 2.2 Implementation

`WikiHtmlRenderer` gets a new output type:

```ts
type ExportMode = 'single-html' | 'static-site';
```

In static site mode, each page gets its own minimal HTML file plus a central `app.js` for navigation. The search index can be shipped as a JSON file and searched client-side.

A one-liner Docker setup or a note about Caddy/Nginx/Netlify deployment rounds it off.

---

## Phase 3: Theme & Obsidian Compatibility

### 3.1 CSS Variable Adapter

Replace hardcoded colors with a theme adapter:

```css
:root {
  --ahe-bg-primary: var(--background-primary, #ffffff);
  --ahe-bg-secondary: var(--background-secondary, #f6f6f6);
  --ahe-text-normal: var(--text-normal, #37352f);
  --ahe-text-muted: var(--text-muted, #787774);
  --ahe-border: var(--background-modifier-border, #e0e0e0);
  --ahe-accent: var(--interactive-accent, #0066cc);
}
```

Benefits:
- Export CSS becomes independent of Obsidian theme changes
- Optional Obsidian values could be adopted during export later
- No conflicts with embedded Obsidian CSS

### 3.2 Extended Wiki Links

Expand the link regex in `linkResolver.ts` to support all Obsidian variants:

```ts
// Target patterns
[[Note]]
[[Note|Alias]]
[[Note#Heading]]
[[Note#Heading|Alias]]
[[Note^blockid]]
![[Image.png]]
![[Image.png|300]]
![[Note#Heading]]
```

The internal link model should separate fragment type and value:

```ts
type ResolvedWikiLink = {
  original: string;
  targetPath?: string;
  targetSlug?: string;
  fragment?: { type: 'heading' | 'block'; value: string };
  alias: string;
  isEmbed: boolean;
  isMissing: boolean;
};
```

### 3.3 Custom CSS

Add a text field in plugin settings for custom CSS to inject into the export. Simple but powerful.

---

## Phase 4: Publish-like Features

Once phases 1–3 are complete, these features can be built:

| Feature | Description |
|---|---|
| **Backlinks per page** | List of incoming links at the bottom of each page |
| **Graph view data** | `graph.json` with nodes/edges for D3.js or vis.js |
| **Tag index** | `/tags/` page with all tags and linked pages |
| **Folder index** | Directory tree in the sidebar |
| **Aliases** | Pages accessible under multiple slugs |
| **Full-text search** | Search index with page content, not just titles |
| **Canonical URLs** | For self-hosting: `rel="canonical"` and consistent URLs |
| **Sitemap** | `sitemap.xml` for search engines |

---

## Architecture Recommendation: WikiModel as an Intermediate Layer

The biggest architectural gain would be introducing an explicit intermediate layer between Obsidian rendering and HTML output:

```
Obsidian Vault
  → collect files
  → resolve links
  → read frontmatter
  → render pages (as before, via MarkdownRenderer)
  → build WikiModel
  → output single HTML / static site
```

```ts
type ExportedPage = {
  id: string;                       // file.path
  slug: string;                     // path-based
  title: string;                    // frontmatter.title ?? basename
  path: string;
  html: string;                     // rendered content
  links: Array<{ target: string; alias: string }>;
  backlinks: Array<{ source: string; title: string }>;
  headings: Array<{ level: number; text: string; id: string }>;
  frontmatter: Record<string, unknown>;
  assets: ExportAsset[];
};
```

Currently, collection, rendering, page list, template, and runtime app are tightly coupled. A separate model layer allows keeping the existing single HTML mode intact while implementing the static site mode in parallel, without breaking existing code.

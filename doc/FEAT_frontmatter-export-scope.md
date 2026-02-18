# Feature Document: Frontmatter-based Export Scope Control

## Overview

Control export scope per note using frontmatter. With the `export` frontmatter key, you can define for each note:
- Which links are traversed (maxDepth)
- Which notes are excluded (tags/frontmatter flag)
- Whether the root note is included

**Status:** Planned | **Priority:** High | **Est. Effort:** ~6 hours

---

## 1. Problem Statement

Currently, link depth applies globally to all exports. Users cannot:
- Exclude specific notes from export
- Define different export depths for different notes
- Export only a single note without its linked notes

---

## 2. Goals

- Frontmatter-based export configuration per note
- Tag-based and frontmatter-flag-based excludes
- Cycle protection during link traversal
- Stop-traverse for excluded notes

---

## 3. Frontmatter Schema

```yaml
---
export:
  enabled: true           # Enable export (default: true)
  scope:
    maxDepth: 2          # Override link depth
    includeRoot: true    # Include root note
  exclude:
    tags: ["noexport", "private"]  # Tags to exclude
    frontmatterFlag: "exportExclude"  # Frontmatter flag
---

#noexport
This note will not be exported.
```

**Notes:**
- Tags in frontmatter: use without `#` (e.g., `noexport` matches `#noexport`)
- Frontmatter flag: set to `true` to exclude

---

## 4. Technical Implementation

### 4.1 WikiExportOptions Extension

```typescript
export interface WikiExportOptions {
  // ... existing
  exportScope?: {
    enabled: boolean;
    maxDepth: number;
    includeRoot: boolean;
  };
  exclude?: {
    tags: string[];
    frontmatterFlag: string;
  };
}
```

### 4.2 Helper Methods

```typescript
private getFileFrontmatter(file: TFile): Record<string, unknown> | null {
  return this.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
}

private isExcluded(file: TFile): boolean {
  const fm = this.getFileFrontmatter(file);
  if (!fm || !this.options.exclude) return false;
  
  // Check frontmatter flag
  if (this.options.exclude.frontmatterFlag && 
      fm[this.options.exclude.frontmatterFlag] === true) {
    return true;
  }
  
  // Check tags
  if (this.options.exclude.tags?.length) {
    const fileTags = this.app.metadataCache.getFileCache(file)?.tags ?? [];
    const tagNames = fileTags.map(t => t.tag.replace(/^#/, ''));
    if (tagNames.some(t => this.options.exclude.tags.includes(t))) {
      return true;
    }
  }
  
  return false;
}
```

### 4.3 Traversal Logic

- BFS traversal with depth tracking
- Cycle protection via visited Set
- **Stop-traverse**: Excluded notes are NOT traversed further

```typescript
private async collectLinkedNotes(
  file: TFile,
  currentDepth: number,
  maxDepth: number,
  visited: Set<string>
): Promise<TFile[]> {
  const result: TFile[] = [];

  if (visited.has(file.path)) return result;
  
  // NEW: Exclude check - STOP TRAVERSE
  if (this.isExcluded(file)) {
    return result;  // Don't traverse further!
  }

  if (currentDepth >= maxDepth) return result;

  visited.add(file.path);
  result.push(file);

  // ... rest of link traversal
}
```

### 4.4 collectNotes() Integration

```typescript
async collectNotes(centralFile: TFile): Promise<NoteInfo[]> {
  // 1. Read frontmatter from root
  const fm = this.getFileFrontmatter(centralFile);
  const exportConfig = fm?.export as WikiExportOptions['exportScope'];
  
  // 2. Override options with frontmatter values (if present)
  if (exportConfig?.enabled === false) {
    return [/* only central file */];
  }
  
  const maxDepth = exportConfig?.maxDepth ?? this.options.linkDepth;
  const includeRoot = exportConfig?.includeRoot ?? true;
  
  // 3. Collect with exclude checks
  const collectedFiles = await this.collectLinkedNotes(
    centralFile, 
    0, 
    maxDepth, 
    new Set<string>()
  );
  // ...
}
```

---

## 5. User Stories

| Priority | Story | Acceptance Criteria |
|----------|-------|---------------------|
| P0 | I want to exclude notes from export | Notes with `#noexport` tag or `exportExclude: true` are not exported |
| P0 | I want to control link depth per note | `export.scope.maxDepth` overrides global setting |
| P1 | I want #noexport notes completely ignored | Their outlinks are also not traversed |
| P1 | I want to export only the root note | `export.enabled: false` exports root only |

---

## 6. Exclude Precedence

For each file `f`:

1. If `frontmatter[frontmatterFlag] === true` → **exclude**
2. If file tags contain any of `exclude.tags` → **exclude**
3. Otherwise → **include**

---

## 7. Settings Integration

Add to plugin settings:

- **Exclude tags**: Text input for comma-separated tags (default: "noexport")
- **Exclude frontmatter flag**: Text input (default: "exportExclude")

---

## 8. Edge Cases

- `[[Note#Heading]]` / `[[Note|Alias]]` → handled by `parseLinktext` + `getFirstLinkpathDest`
- Unresolved links → ignored
- Cycles (A→B→A) → prevented by `visited` Set
- Tags: Obsidian returns tags with `#` (e.g., `#noexport`) → matched against config

---

## 9. Migration Path

- Default values maintain backward compatibility
- No breaking changes to existing exports
- Optional feature - only activates when frontmatter is present

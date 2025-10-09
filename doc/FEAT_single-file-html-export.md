# Feature Document: Single File HTML Export MVP

## Overview
Add a new command to export the currently active/opened file as a standalone HTML file, providing a quick way to share individual notes without the complexity of full vault exports.

## Motivation
Users often need to share individual notes as HTML files for:
- Email attachments
- Blog posts
- Documentation sharing
- Quick previews outside Obsidian

The current vault export is too heavy for single-file use cases.

## Scope (MVP)
- Export only the currently active file
- Basic HTML structure with clean styling
- Image embedding (base64)
- Preserve markdown formatting
- Simple, self-contained HTML output

## Out of Scope (Future)
- Plugin rendering (Dataview, etc.)
- Nested file linking
- Advanced styling/themes
- Multiple file selection

## Technical Implementation

### Command Structure
Add new command: `"Export Current File as HTML"`

### HTML Generation Process
1. Get current active file from `app.workspace.getActiveFile()`
2. Read file content using `vault.cachedRead(file)`
3. Use `MarkdownRenderer.render()` to convert markdown to HTML
4. Embed images as base64 (following reference implementation)
5. Wrap in clean HTML template with CSS
6. Download as `.html` file

### Key Components
- **HtmlRenderer class**: Similar to reference but simplified
- **Image handling**: Base64 embedding for portability
- **CSS styling**: Clean, readable output (GitHub Markdown CSS style)

### File Structure
```
src/
  commands/
    exportSingleFile.ts    # New command implementation
  utils/
    htmlRenderer.ts       # HTML generation logic
    fileUtils.ts          # File operations
```

## User Experience
1. User opens a note
2. Runs command palette → "Export Current File as HTML"
3. File downloads automatically as `{filename}.html`
4. HTML opens in browser with clean, readable formatting

## Success Criteria
- ✅ Exports current file as valid HTML
- ✅ Images embedded properly
- ✅ Markdown formatting preserved
- ✅ File size reasonable (< 5MB for typical notes)
- ✅ Works on desktop and mobile (when supported)

## Dependencies
- Uses existing Obsidian APIs (`MarkdownRenderer`, `vault`)
- No external dependencies needed
- Follows existing code patterns from main.ts

## Testing
- Unit tests for HTML generation
- Integration tests with sample markdown files
- Image embedding verification

## Future Extensions
- Settings panel for export options
- Custom CSS themes
- Plugin rendering support
- Batch export of multiple files

This MVP provides immediate value while being simple to implement and test, serving as a foundation for more advanced export features.
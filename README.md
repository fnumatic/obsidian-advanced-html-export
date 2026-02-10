# Obsidian Advanced HTML Export

Export Obsidian notes as self-contained HTML files with advanced features for sharing and archiving.

## What is this plugin for

The Advanced HTML Export plugin allows you to export individual Obsidian notes as self-contained HTML files. Key features include:

- **Self-contained exports**: All CSS is embedded, no external dependencies
- **Clean formatting**: Uses GitHub-style markdown rendering with responsive design
- **Safe filenames**: Automatically generates web-safe filenames
- **Progress feedback**: Shows export progress and completion notifications
- **Current file export**: Quick export of the currently active note via command palette
- **Bulk wiki export**: Export entire wikis as single HTML with SPA navigation
- **Wiki link resolution**: Automatically resolves [[Wiki Links]] across all notes
- **Sidebar navigation**: Collapsible sidebar with page list and search

## Why another HTML export plugin

While Obsidian has built-in HTML export capabilities, this plugin offers several advantages:

- **Clean export of inline nested notes**: Properly handles and displays nested note structures with clean formatting
- **TOC with fully working links**: Generates table of contents with functional internal links for navigation within complex documents
- **Export renderings of other plugins**: Captures and exports the rendered output from other Obsidian plugins (like Dataview, Kanban, etc.)
- **Smallest HTML files possible**: Produces highly optimized, minimal HTML files even when embedding images and other assets

## Wiki Export

Export a network of linked notes as a single HTML file with single-page application navigation.

### Features

- **Single HTML file**: All notes embedded in one portable file
- **SPA navigation**: Instant page switches without reload
- **History support**: Browser back/forward buttons work
- **Breadcrumb navigation**: Shows current location in wiki
- **Collapsible sidebar**: Hide/show navigation panel
- **Page search**: Filter pages in sidebar

### Usage

1. Open any note in the wiki
2. Run "Export wiki as HTML" from command palette
3. All linked notes are collected and exported
4. Open the HTML file - navigate between pages using the sidebar or links

## Embedding Excalidraw into your Notes and Exporting

### Prerequisites

Ensure you have the [Obsidian Excalidraw Plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin) installed and enabled.

### Configuration

To include Excalidraw diagrams in your exported HTML, configure the following settings in the Excalidraw plugin:

1. **Open Excalidraw Settings**
   - Go to `Settings → Community Plugins → Excalidraw`

2. **Enable SVG Export**
   - Find the **"Export"** section
   - Enable **"Export as native SVG"**
   - This ensures diagrams are embedded as actual SVG markup rather than temporary blob URLs

### Usage

Once configured, embed Excalidraw diagrams in your notes using wiki-links:

```markdown
![[my-diagram.excalidraw]]
```

The diagrams will be automatically converted to embedded SVG when exporting to HTML.

### Troubleshooting

**Problem:** Excalidraw diagrams appear as empty placeholders or don't render  
**Solution:** Verify "Export as native SVG" is enabled in Excalidraw settings

## Installation

### Via BRAT Plugin (Recommended)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) from Obsidian's community plugins
2. Open BRAT settings and add this repository: `fnumatic/obsidian-advanced-html-export`
3. Enable the plugin in your Obsidian settings

### Manual Installation

1. Download the latest release from the [GitHub releases page](https://github.com/fnumatic/obsidian-advanced-html-export/releases)
2. Extract the files to your vault's `.obsidian/plugins/obsidian-advanced-html-export/` directory
3. Reload Obsidian and enable the plugin in settings

## Usage

### Single File Export

1. Open any note in Obsidian
2. Use the command palette (`Ctrl/Cmd + P`) and search for "Export Current File as HTML"
3. The file will be exported as a self-contained HTML file and downloaded to your default downloads folder
4. Open the HTML file in any web browser to view the formatted note

### Wiki Export

1. Open any note in your wiki (a note with [[Wiki Links]] to other notes)
2. Use the command palette (`Ctrl/Cmd + P`) and search for "Export wiki as HTML"
3. All linked notes are collected and exported to a single HTML file
4. Open the HTML file to navigate between pages using the sidebar or links

## Development Process

### Prerequisites

- Node.js 22 (LTS)
- A package manager (pnpm, npm, or yarn)

### Setup

1. Clone the repository
2. Install dependencies: `pnpm install`

### Development

- Start development server: `pnpm dev`

  This launches an interactive development environment that:
  - Scans for Obsidian vaults that have been opened at least once
  - Presents a menu to select which vault to develop against
  - Builds the plugin in watch mode with source maps
  - Automatically copies updated plugin files to the selected vault on each change

#### Plugin Hot Reload in Obsidian

For automatic plugin reloading in Obsidian without restarting the app, install the [Hot Reload plugin](https://github.com/pjeby/hot-reload) from the Obsidian community plugins. This allows your changes to be reflected immediately in the running Obsidian instance.

### Building

- Build for production: `pnpm build`
- Preview the built plugin: `pnpm preview`

### Testing

- Run all tests: `pnpm test`
- Run tests in watch mode: `pnpm test:watch`
- Type check: `pnpm type-check`



## Release procedure

The release process uses release-it for automated versioning and publishing.

### Artifacts generated

- Built plugin files (main.js, manifest.json, styles.css)
- CHANGELOG.md with release notes
- GitHub release with attached plugin zip
- Version tags in git

### GitHub Actions

- `release.yml`: Triggers on version tags, builds and releases to GitHub
- `beta-release.yml`: Triggers on beta branches/tags for pre-releases

### Local testing of GitHub Actions

Use the `act` tool to test workflows locally:
```bash
# Install act
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | bash

# Test release workflow
act -j release

# Test beta release
act -j beta-release
```

## Standing on shoulders of giants

- https://github.com/obsidian-tools/obsidian-tools
- https://github.com/release-it/release-it
- https://github.com/aidenlx
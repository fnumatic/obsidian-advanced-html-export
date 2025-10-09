# Obsidian Advanced HTML Export

Export Obsidian notes as self-contained HTML files with advanced features for sharing and archiving.

## What is this plugin for

The Advanced HTML Export plugin allows you to export individual Obsidian notes as self-contained HTML files. Key features include:

- **Self-contained exports**: All CSS is embedded, no external dependencies
- **Clean formatting**: Uses GitHub-style markdown rendering with responsive design
- **Safe filenames**: Automatically generates web-safe filenames
- **Progress feedback**: Shows export progress and completion notifications
- **Current file export**: Quick export of the currently active note via command palette

## Why another HTML export plugin

While Obsidian has built-in HTML export capabilities, this plugin offers several advantages:

- **Clean export of inline nested notes**: Properly handles and displays nested note structures with clean formatting
- **TOC with fully working links**: Generates table of contents with functional internal links for navigation within complex documents
- **Export renderings of other plugins**: Captures and exports the rendered output from other Obsidian plugins (like Dataview, Kanban, etc.)
- **Smallest HTML files possible**: Produces highly optimized, minimal HTML files even when embedding images and other assets

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

1. Open any note in Obsidian
2. Use the command palette (`Ctrl/Cmd + P`) and search for "Export Current File as HTML"
3. The file will be exported as a self-contained HTML file and downloaded to your default downloads folder
4. Open the HTML file in any web browser to view the formatted note

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
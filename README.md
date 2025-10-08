# Obsidian Plugin Starter

A simple starter project for Obsidian plugins that demonstrates a semi-automatic pipeline for builds using Vite.js.

## What is this plugin template used for

This template provides a foundation for developing Obsidian plugins with modern tooling. It includes:
- TypeScript setup for type-safe development
- Vite for fast builds and development
- Automated release management with release-it
- GitHub Actions for CI/CD
- Testing framework with Vitest

## Why use Vite.js

Vite.js is used for its:
- Fast development server with hot module replacement
- Optimized production builds
- Modern ES module support
- Excellent TypeScript integration
- Plugin ecosystem for Obsidian-specific optimizations

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

## How to clone into new git project with fresh history

### Using GitHub as template

1. Click "Use this template" on the GitHub repository
2. Create a new repository from the template
3. Clone your new repository

### Using degit

```bash
npx degit https://github.com/fnumatic/obsidian-plugin-starter your-plugin-name
cd your-plugin-name
git init
git add .
git commit -m "Initial commit"
```

### Using default git with fresh history

```bash
git clone https://github.com/fnumatic/obsidian-plugin-starter your-plugin-name
cd your-plugin-name
rm -rf .git
git init
git add .
git commit -m "Initial commit"
```

## How to adapt plugin template to your needs

### Change plugin name

1. Update `package.json`:
   - Change `name`, `description`, `author`
   - Update repository URL and homepage
2. Update `manifest.json`:
   - Change `id`, `name`, `description`
   - Update `author` and `authorUrl`
3. Update `main.ts`:
   - Change the plugin class name
   - Update any string literals with the old name
4. Update `README.md` and other documentation files

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
# Agent Guidelines for Obsidian Plugin Development

This document provides comprehensive guidelines for AI agents working on the obsidian-advanced-html-export project.

## Project Overview

Obsidian plugin that exports notes as self-contained HTML files with advanced features including image optimization, deduplication, and lazy loading support.

## Commands

### Development
- **Dev mode**: `pnpm dev` - Run development server with hot reload
- **Dev default**: `pnpm dev:default` - Run with default vault configuration
- **Preview**: `pnpm preview` - Copy build to vault for testing

### Build & Type Check
- **Build plugin**: `pnpm build` - Compile TypeScript and copy manifest to dist/
- **Type check**: `pnpm type-check` - Run TypeScript compiler without emitting files (`tsc --noEmit`)
- **Release**: `pnpm release` - Create release with automatic changelog
- **Release dry-run**: `pnpm release:dry` - Test release process without publishing

### Testing
- **Run all tests**: `pnpm test` - Execute all tests in headless mode
- **Watch mode**: `pnpm test:watch` - Run tests with file watching for development
- **Single test by name**: `pnpm test -- --testNamePattern="test name"` - Run tests matching pattern
- **Single test file**: `pnpm test path/to/test.js` - Run specific test file
- **Workflow validation**: `pnpm validate-workflow` - Test GitHub Actions locally

## TypeScript Configuration

The project uses strict TypeScript settings configured in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES6",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "inlineSourceMap": true,
    "inlineSources": true
  }
}
```

## Code Style Guidelines

### Imports and Dependencies

- **External imports first**: Import Obsidian and npm packages before relative imports
- **Named imports preferred**: Use `import { App, Plugin } from 'obsidian'` over default imports
- **Relative imports**: Use `./` for same-directory, `../` for parent directories
- **Side-effect imports**: Use `import './styles.css'` for CSS files

Example:
```typescript
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import './styles.css';
import { ExportSingleFileCommand } from './commands/exportSingleFile';
import { HtmlRenderer } from './utils/htmlRenderer';
```

### Naming Conventions

- **Variables & Functions**: `camelCase` - `imageQuality`, `generateSafeFilename`
- **Classes & Interfaces**: `PascalCase` - `AdvancedHtmlExportPlugin`, `HtmlRendererSettings`
- **Constants**: `UPPER_SNAKE_CASE` - `DEFAULT_SETTINGS`, `IMAGE_EXTENSIONS`
- **Files**: `kebab-case` - `file-utils.ts`, `export-single-file.ts`

### Code Patterns

- **Semicolons**: Use semicolons at end of statements
- **Arrow functions**: Prefer arrow functions over traditional function syntax
- **Optional chaining**: Use `?.` for safe property access
- **Nullish coalescing**: Use `??` for default values
- **Early returns**: Return early to reduce nesting and improve readability

Example:
```typescript
const fileName = paramParts?.[0];
const timestamp = paramParts?.[1];

if (file === undefined) {
  console.warn(`Could not find image [${imagePath}]. Skipping.`);
  return '';
}
```

### Type Annotations

- **Explicit types**: Always annotate function parameters and return types
- **Interface vs Type**: Use `interface` for object shapes, `type` for unions/primitives
- **Avoid `any`**: Use `unknown` for truly unknown types, use `as` assertions sparingly
- **Array types**: Use `Array<Type>` or `Type[]` consistently (prefer `Type[]`)

Example:
```typescript
interface AdvancedHtmlExportSettings {
  imageQuality: 'high' | 'medium' | 'low';
  enableLazyLoading: boolean;
  enableImageDeduplication: boolean;
}

async render(markdownContent: string): Promise<string> {
  // ...
}
```

### Error Handling

- **Defensive null checks**: Always check for undefined/null before accessing properties
- **Empty collections over null**: Return `[]` or `{}` instead of null
- **Try-catch for async operations**: Wrap async operations that may fail
- **Console warnings**: Log warnings with context for recoverable errors
- **Error messages**: Use descriptive error messages with variable interpolation

Example:
```typescript
try {
  buffer = this.parseDataUrlToBuffer(imagePath);
} catch (error) {
  console.warn(`Failed to parse data URL [${imagePath}]:`, error);
  return '';
}
```

### JSDoc Documentation

Document public methods with JSDoc comments:

```typescript
/**
 * Converts an image path to optimized base64 string for embedding
 * @param imagePath The image path as returned by the MarkdownRenderer
 * @returns The base64 representation of the optimized image or empty string if not found
 */
private async convertImageToBase64String(imagePath: string): Promise<string> {
  // ...
}
```

## Testing with Vitest

### Test Structure

- **Location**: Tests in same directory as source, named `*.test.ts`
- **Mocks**: Place mocks in `__mocks__/` directory at project root
- **Framework**: Vitest with `describe`, `it`, `expect`

Example:
```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await vi.importActual('obsidian');
  return {
    ...actual,
    PluginSettingTab: class {}
  };
});

describe('HtmlRenderer', () => {
  it('should render markdown content', async () => {
    // test implementation
  });
});
```

### Mock Patterns

- **Obsidian mocks**: Mock Obsidian API in `src/__mocks__/obsidian.ts`
- **Partial mocks**: Use `vi.importActual` to keep some real implementations
- **Factory functions**: Use factory functions for complex test setup

## Obsidian Plugin Development

### Plugin Structure

- **Main class**: Extend `Plugin` from Obsidian
- **Settings**: Use `loadData()`/`saveData()` for persistent settings
- **Commands**: Register commands with `addCommand()`
- **Setting tabs**: Extend `PluginSettingTab` for configuration UI

### Lifecycle Methods

- **onload**: Initialize plugin, register commands, load settings
- **onunload**: Clean up resources, remove event listeners

Example:
```typescript
export default class AdvancedHtmlExportPlugin extends Plugin {
  settings: AdvancedHtmlExportSettings;

  onload = async () => {
    await this.loadSettings();
    this.addCommand({ /* ... */ });
  };

  onunload = () => {
    // cleanup
  };
}
```

## Vite Build Configuration

The plugin uses Vite for bundling with these key settings:

- **Lib mode**: Outputs CommonJS (`.cjs`) for Obsidian compatibility
- **External dependencies**: Obsidian, Electron, CodeMirror packages are external
- **Sourcemaps**: Disabled in production builds
- **CSS**: Bundled separately as `styles.css`

## Git Workflow

- **Branch naming**: Feature branches as `feature/description`, bugfixes as `bugfix/description`
- **Commits**: Conventional commits preferred but not enforced
- **Releases**: Automated via release-it with semantic versioning

## Additional Notes

- **Node version**: Use Node.js 14+ for compatibility
- **Package manager**: pnpm is the primary package manager
- **Manifest**: Update `manifest.json` and `manifest-beta.json` for version changes
- **Hot reload**: Available during development for rapid iteration

# Agent Guidelines for Obsidian Plugin Development

## Commands
- Build: `pnpm build` | Type check: `pnpm type-check` | Dev: `pnpm dev`
- Test all: `pnpm test` | Test watch: `pnpm test:watch`
- Test single: `pnpm test -- --testNamePattern="test name"`
- Test file: `pnpm test path/to/test.js`

## Code Style
- **TypeScript**: Strict mode, ES6 target, explicit types
- **Imports**: External first, named imports preferred
- **Naming**: camelCase vars/functions, PascalCase classes, UPPER_SNAKE_CASE constants, kebab-case files
- **Patterns**: No semicolons, arrow functions, optional chaining (?.), early returns
- **Error Handling**: Defensive null checks, empty collections over null
- **Testing**: Vitest with describe/it, mocks in `__mocks__`
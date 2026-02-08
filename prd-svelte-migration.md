# PRD: Svelte 5 UI Migration for Obsidian Advanced HTML Export

**Date:** 2026-02-08  
**Branch:** feat/svelte-migrate  
**Estimated Effort:** 19-26 hours (2-3 days)

---

## Problem Statement

### What problem are we solving?
The current UI components (modals) for the Obsidian Advanced HTML Export plugin are implemented using imperative DOM manipulation with Obsidian's Modal API. This approach:

1. **Code complexity**: 730 lines of imperative DOM creation for the RenderingProgressModal alone
2. **State management**: Manual state synchronization between TypeScript and DOM elements
3. **Maintainability**: CSS styles inline in TypeScript, hard to modify and test
4. **Extensibility**: Adding new UI features requires writing more imperative code
5. **Developer experience**: No hot-reload for UI changes during development

The Settings tab (AdvancedHtmlExportSettingTab) also uses imperative API, limiting visual polish and interactivity.

### Why now?
- Plugin UI complexity has grown significantly with recent features (progress tracking, selective export)
- Svelte 5 has matured with stable Runes API and excellent TypeScript support
- Migration now prevents further technical debt accumulation
- Opportunity to improve user experience with better animations and interactions

### Who is affected?
- **Primary users:** Plugin users interacting with export modals and settings
- **Secondary users:** Developers maintaining and extending the plugin
- **Tertiary users:** Contributors who want to add features but find the current DOM-based approach intimidating

---

## Proposed Solution

### Overview
Migrate all plugin UI components from imperative Obsidian Modal API to **Svelte 5** with Runes. The business logic and HTML export templates remain unchanged (vanilla JS/CSS/HTML). Svelte will only power the plugin's internal UI.

**Architecture:**
```
┌─ Plugin UI (Svelte 5) ─────────────────────┐
│  src/components/      ← Svelte components  │
│  src/stores/         ← Shared state        │
│  src/ui/modals/      ← Wrapper classes     │
└────────────────────────────────────────────┘
                    ↓
┌─ Business Logic (TypeScript) ──────────────┐
│  src/utils/          ← Unchanged           │
│  src/commands/       ← Unchanged           │
└────────────────────────────────────────────┘
                    ↓
┌─ Export Templates (Vanilla JS) ────────────┐
│  src/wikiTemplates/  ← UNCHANGED           │
│    ├── *.html        ← Pure HTML           │
│    ├── *.css         ← Pure CSS            │
│    └── *.js          ← Vanilla JS only     │
└────────────────────────────────────────────┘
```

### User Experience
Users will see the same modals and settings, but with:
- Smoother animations (fade, slide transitions)
- Better responsive layout
- More consistent styling with Obsidian themes
- Instant state updates without UI flicker

### Design Considerations
- **Obsidian theme integration**: Components must respect CSS variables (--interactive-accent, --background-primary, etc.)
- **Accessibility**: Proper ARIA labels, keyboard navigation (already present in Obsidian Modal base class)
- **Bundle size**: Target <100KB total (currently ~89KB)
- **Performance**: No performance regression; Svelte's compiled output is lightweight

---

## End State

When this PRD is complete:

- [ ] All modals migrated to Svelte 5 (ExportPreviewModal, NoteSelectionModal, RenderingProgressModal)
- [ ] Settings panel migrated to Svelte 5 component
- [ ] Wrapper classes bridge Svelte components with Obsidian's Modal API
- [ ] Build system updated with @sveltejs/vite-plugin-svelte
- [ ] Bundle size ≤ 95KB (acceptable increase of ~6KB)
- [ ] All existing tests pass
- [ ] TypeScript compilation succeeds without errors
- [ ] Hot-reload works for UI development (`pnpm dev`)
- [ ] No changes to wikiTemplates/ folder (vanilla JS preserved)
- [ ] No changes to business logic in utils/ (shared code preserved)

---

## Success Metrics

### Quantitative
| Metric | Current | Target | Measurement Method |
|--------|---------|--------|-------------------|
| Bundle size | 89KB | ≤95KB | `pnpm build` output |
| Lines of modal UI code | 1261 | ~600 | LOC count in src/ui/ |
| Test pass rate | 100% (44/44) | 100% | `pnpm test` |
| Build time | ~3s | ≤5s | `time pnpm build` |

### Qualitative
- Developer can modify UI in real-time with hot-reload
- New UI features require 50% less code than before
- Components are testable in isolation (Vitest + Svelte Testing Library)

---

## Acceptance Criteria

### Feature: ExportPreviewModal Migration
- [ ] Component `ExportPreview.svelte` created with identical UI/UX
- [ ] Displays notes list with truncation at 60 chars
- [ ] Shows summary row: "📄 X notes · 📊 Y diagrams · 📝 Z code blocks"
- [ ] Three buttons: Cancel, Select Notes, Export All
- [ ] Returns action via promise wrapper

### Feature: NoteSelectionModal Migration
- [ ] Component `NoteSelection.svelte` created with identical UI/UX
- [ ] Checkboxes for each note with search functionality
- [ ] Quick filters: Select All, Select None, With Diagrams Only
- [ ] Shows selected count and estimated time
- [ ] Returns selected notes array via promise wrapper

### Feature: RenderingProgressModal Migration
- [ ] Component `RenderingProgress.svelte` created with identical UI/UX
- [ ] Completed notes list (max 5 visible, min-height 114px)
- [ ] Current note progress with 3 artifact rows (diagrams, code blocks, images)
- [ ] Overall progress bar (18px height)
- [ ] Time stats (elapsed, remaining, speed)
- [ ] Pause/Resume button with status indicator
- [ ] Cancel button with confirmation
- [ ] Auto-close on completion
- [ ] Real-time event updates from DetailedWikiRenderer

### Feature: Settings Panel Migration
- [ ] Component `SettingsPanel.svelte` created
- [ ] All 9 settings rendered as form controls
- [ ] Settings persist via plugin.saveData()
- [ ] Toggle switches, sliders, dropdowns, text inputs
- [ ] Obsidian Setting component replaced with Svelte equivalents

### Feature: Build System
- [ ] @sveltejs/vite-plugin-svelte@^4.0.0 installed
- [ ] svelte@^5.0.0 installed
- [ ] vite.config.ts updated with svelte plugin
- [ ] tsconfig.json includes .svelte files
- [ ] CSS bundling configured for Svelte styles

---

## Technical Context

### Existing Patterns

**Modal Pattern (current):**
```typescript
// src/ui/renderingProgressModal.ts (730 lines)
export class RenderingProgressModal extends Modal {
  onOpen(): void {
    // Imperative DOM creation
    const contentEl = this.contentEl;
    contentEl.createEl('h2', { text: 'Rendering...' });
    // ... 700 more lines of DOM manipulation
  }
}
```

**New Svelte Pattern:**
```typescript
// src/ui/modals/RenderingProgressModal.ts (wrapper)
export class RenderingProgressModal extends Modal {
  private component: ReturnType<typeof mount>;
  
  onOpen(): void {
    this.component = mount(RenderingProgress, {
      target: this.contentEl,
      props: { metrics, token, pauseController }
    });
  }
  
  onClose(): void {
    unmount(this.component);
  }
}
```

```svelte
<!-- src/components/RenderingProgress.svelte -->
<script lang="ts">
  let { metrics, token, pauseController } = $props();
  let completedNotes = $state([]);
  // ... reactive Svelte 5 code
</script>

<div class="rendering-progress">
  <!-- Clean declarative markup -->
</div>
```

### Key Files

**To Migrate:**
- `src/ui/exportPreviewModal.ts` → `src/components/ExportPreview.svelte`
- `src/ui/noteSelectionModal.ts` → `src/components/NoteSelection.svelte`
- `src/ui/renderingProgressModal.ts` → `src/components/RenderingProgress.svelte`
- `src/main.ts` settings panel → `src/components/SettingsPanel.svelte`

**Unchanged (Business Logic):**
- `src/utils/wikiExportOrchestrator.ts` - Orchestration logic
- `src/utils/detailedRenderer.ts` - Rendering with events
- `src/utils/cancellationToken.ts` - Cancellation support
- `src/utils/pauseController.ts` - Pause/resume support
- `src/utils/wikiHtmlRenderer.ts` - HTML generation
- `src/utils/linkResolver.ts` - Link resolution
- `src/utils/templateUtils.ts` - Template processing
- `src/commands/exportWiki.ts` - Export command
- `src/commands/exportSingleFile.ts` - Single file export

**Protected (Vanilla JS Export Templates):**
- `src/wikiTemplates/template.html`
- `src/wikiTemplates/styles.css`
- `src/wikiTemplates/signals.js`
- `src/wikiTemplates/helpers.js`
- `src/wikiTemplates/app.js`

### System Dependencies

**New Dependencies:**
- `svelte@^5.0.0` - Core framework
- `@sveltejs/vite-plugin-svelte@^4.0.0` - Vite integration
- `svelte-check` - TypeScript checking for Svelte files

**Existing (preserved):**
- `vite@^7.3.1` - Build tool
- `typescript@^5.9.3` - Type checking
- `obsidian` - Obsidian API
- `vitest` - Testing

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bundle size exceeds target | Medium | Medium | Tree-shaking, lazy load heavy components, audit deps |
| Svelte 5 breaking changes | Low | High | Pin to stable 5.x, follow migration guide |
| Obsidian API incompatibilities | Low | Medium | Test all modal interactions, use wrapper pattern |
| Performance regression | Low | High | Benchmark rendering time, profile with DevTools |
| TypeScript errors in .svelte files | Medium | Medium | Strict tsconfig, svelte-check CI step |
| Developer learning curve | Medium | Low | Document patterns, provide examples |

---

## Alternatives Considered

### Alternative 1: Keep Current Imperative Approach
- **Description:** Continue with Obsidian's Modal API and manual DOM manipulation
- **Pros:** No migration effort, no new dependencies
- **Cons:** Technical debt accumulates, harder to maintain, slower development
- **Decision:** Rejected. Current approach doesn't scale with UI complexity.

### Alternative 2: React + Obsidian React Components
- **Description:** Use React with existing obsidian-react-components library
- **Pros:** Familiar ecosystem, many UI libraries available
- **Cons:** Larger bundle size (~40KB min), more complex setup, virtual DOM overhead
- **Decision:** Rejected. Svelte's compiled output is smaller and fits Obsidian's lightweight plugin model better.

### Alternative 3: Vue 3 with Composition API
- **Description:** Use Vue 3 for UI components
- **Pros:** Good TypeScript support, mature ecosystem
- **Cons:** Larger runtime, different mental model from current code
- **Decision:** Rejected. Svelte 5 Runes are simpler and compile to vanilla JS.

### Alternative 4: Web Components
- **Description:** Use native Web Components with Lit
- **Pros:** No framework lock-in, native browser support
- **Pros:** Less mature tooling, more verbose code
- **Decision:** Rejected. Svelte offers better developer experience and compiles to efficient code.

---

## Non-Goals (v1)

Explicitly out of scope:
- **Wiki template migration** - Keep vanilla JS/CSS/HTML in wikiTemplates/
- **New UI features** - Only migrate existing functionality
- **Design system** - No component library, just migrate what's needed
- **Storybook** - Not needed for internal plugin UI
- **Mobile-specific optimizations** - Assume desktop Obsidian usage

---

## Interface Specifications

### Component Props Interfaces

```typescript
// src/components/types.ts

interface ExportPreviewProps {
  metrics: ExportMetrics;
  notes: NoteInfo[];
  onAction: (action: 'cancel' | 'exportAll' | 'selectNotes') => void;
}

interface NoteSelectionProps {
  notes: NoteInfo[];
  onConfirm: (selected: NoteInfo[]) => void;
  onCancel: () => void;
}

interface RenderingProgressProps {
  metrics: ExportMetrics;
  token: CancellationToken;
  pauseController: PauseController;
  onComplete: () => void;
  onCancel: () => void;
}

interface SettingsPanelProps {
  settings: AdvancedHtmlExportSettings;
  onChange: (settings: AdvancedHtmlExportSettings) => void;
}
```

### Store Interfaces

```typescript
// src/stores/types.ts

interface ExportStore {
  stage: ExportStage;
  collectedNotes: NoteInfo[];
  selectedNotes: NoteInfo[];
  metrics: ExportMetrics | null;
}

interface ProgressStore {
  completedNotes: CompletedNote[];
  currentNote: CurrentNoteProgress | null;
  isPaused: boolean;
  isCancelled: boolean;
  startTime: number;
}
```

---

## Documentation Requirements

- [ ] Update README.md with Svelte development instructions
- [ ] Document component patterns in docs/ui-components.md
- [ ] Add JSDoc to all wrapper classes
- [ ] Update AGENTS.md with Svelte guidelines

---

## Open Questions

| Question | Owner | Due Date | Status |
|----------|-------|----------|--------|
| Use SvelteKit or plain Svelte? | TBD | 2026-02-08 | Resolved: Plain Svelte (no routing needed) |
| Store library (Svelte stores vs nanostores)? | TBD | 2026-02-08 | Resolved: Svelte 5 Runes + built-in stores |
| Testing approach for Svelte components? | TBD | 2026-02-08 | Resolved: Vitest + @testing-library/svelte |
| CSS approach (scoped vs global)? | TBD | 2026-02-08 | Resolved: Scoped + CSS variables for theming |

---

## Appendix

### Glossary
- **Runes:** Svelte 5's new reactivity system ($state, $derived, $effect)
- **Wrapper:** TypeScript class that extends Obsidian Modal and embeds Svelte component
- **Vanilla JS:** Plain JavaScript without frameworks (preserved for wiki templates)

### References
- [Svelte 5 Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/what-are-runes)
- [@sveltejs/vite-plugin-svelte](https://github.com/sveltejs/vite-plugin-svelte)
- [Obsidian Modal API](https://docs.obsidian.md/Reference/TypeScript+API/Modal)
- [Original architecture discussion](./ARCHITECTURE.md)

---

## Migration Checklist

### Phase 1: Setup (2-3 hours)
- [ ] Install Svelte 5 dependencies
- [ ] Update vite.config.ts with svelte plugin
- [ ] Update tsconfig.json
- [ ] Create src/components/ and src/stores/ directories
- [ ] Test build with empty Svelte component

### Phase 2: ExportPreviewModal (3-4 hours)
- [ ] Create ExportPreview.svelte
- [ ] Create ExportPreviewModal wrapper
- [ ] Wire up in exportWiki.ts
- [ ] Test functionality

### Phase 3: NoteSelectionModal (3-4 hours)
- [ ] Create NoteSelection.svelte
- [ ] Create NoteSelectionModal wrapper
- [ ] Wire up in exportWiki.ts
- [ ] Test search, filters, selection

### Phase 4: RenderingProgressModal (5-6 hours)
- [ ] Create RenderingProgress.svelte
- [ ] Create RenderingProgressModal wrapper
- [ ] Implement real-time event handling
- [ ] Wire up in exportWiki.ts
- [ ] Test pause, cancel, completion

### Phase 5: Settings Panel (3-4 hours)
- [ ] Create SettingsPanel.svelte
- [ ] Integrate with AdvancedHtmlExportSettingTab
- [ ] Test all settings persistence

### Phase 6: Polish (2-3 hours)
- [ ] Add animations
- [ ] Ensure Obsidian theme integration
- [ ] Optimize bundle size
- [ ] Update documentation

### Phase 7: Testing (2-3 hours)
- [ ] Run all tests
- [ ] Manual testing in Obsidian
- [ ] Check bundle size
- [ ] Performance profiling

**Total Estimated Time: 19-26 hours**

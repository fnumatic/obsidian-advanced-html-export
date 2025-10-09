# Product Requirements Document (PRD): Obsidian Single-HTML Compiler

## 1. Document Information

- Product Name: Obsidian Single-HTML Compiler (Plugin)
- Version: 1.0
- Author: Grok (xAI Assistant)
- Date: October 08, 2025
- Status: Draft

## 2. Overview

### 2.1 Product Description

The Obsidian Single-HTML Compiler is an Obsidian plugin that exports an entire vault (or selected notes/folders) into a single, self-contained HTML file. This "compiled" output preserves the hierarchical structure of notes, including nested subnotes, internal links, and rendered output from other Obsidian plugins (e.g., Dataview tables, Excalidraw diagrams). The design mimics a modern portfolio-style single-page application (SPA), inspired by the clean, animated layout of Emrah Gurkan's portfolio project page at [https://emrah.ca/onair/Projects/Animation+%2B+Design](https://emrah.ca/onair/Projects/Animation+%2B+Design), particularly the "Viking" section showcase. The resulting file prioritizes minimal size through aggressive optimization, enabling portable, offline browsing of complex knowledge bases without the need for Obsidian or external assets.

### 2.2 Motivation

Obsidian users often need to share or archive vaults portably, but existing exporters (e.g., Webpage HTML Export) produce bloated files with incomplete plugin support and suboptimal designs. This plugin addresses:

- Bloat from unoptimized embeds (e.g., base64 images).
- Loss of plugin-rendered content (e.g., dynamic queries).
- Flat structures that ignore note nesting.
- Generic UIs that don't evoke a polished, engaging reading experience.

### 2.3 Scope

- In Scope: Core export functionality, nesting handling, plugin rendering, optimized single-file output, and a responsive SPA-like UI.
- Out of Scope: Multi-file exports, server-side hosting, real-time collaboration, or non-Obsidian input formats. Advanced features like PDF output or encrypted files may be future enhancements.

## 3. Goals and Objectives

### 3.1 Business Goals

- Provide a lean alternative to existing plugins, targeting <5MB files for vaults with 100+ notes (vs. 20MB+ for competitors).
- Achieve 90%+ fidelity in rendering plugin outputs (e.g., Tasks, Admonitions).
- Foster community adoption by open-sourcing on GitHub, aiming for 1K+ downloads in the first year.

### 3.2 User Goals

- Export complex, nested notes as a browsable, single file that feels like a native app.
- Maintain visual and interactive richness (e.g., smooth transitions between sections).
- Minimize file size for easy emailing/sharing without zipping.

### 3.3 Success Metrics

- Quantitative: Average export file size reduction (target: 60% vs. baseline plugins); load time <2s in Chrome on mid-range hardware; user-reported fidelity score >4.5/5.
- Qualitative: Forum feedback on usability; GitHub stars/forks; retention in Obsidian's plugin browser.

## 4. Target Users and Personas

- Primary Users: Knowledge workers, researchers, and writers using Obsidian for interconnected notes (e.g., PKM enthusiasts with 50-500 notes).
- Persona Example:
  - Name: Alex, 35, Tech Lead.
  - Needs: Export project docs with diagrams (Excalidraw) and queries (Dataview) to share with non-Obsidian team members.
  - Pain Points: Bloated exports slow email attachments; lost nesting makes navigation hard.
  - Usage: Exports weekly; values mobile-friendly design.

## 5. User Stories

As an Obsidian user, I want to:

- Select a vault/folder and export to a single HTML file via a command palette action, so I can quickly generate portable docs.
- See a hierarchical sidebar tree reflecting note nesting and links, so I can navigate subnotes intuitively.
- Have plugin-rendered content (e.g., tables, embeds) baked into the export, so shared files retain full context.
- Experience smooth, animated transitions between sections (e.g., fade-ins on scroll), so the output feels modern and engaging.
- Toggle optimization options (e.g., "ultra-lean" mode skips graph), so I can balance size vs. features.

## 6. Functional Requirements

### 6.1 Core Export Functionality

- FR-1: Command to export vault/selection: Traverse files recursively; resolve links/backlinks; generate single HTML.
- FR-2: Nested Doc Handling: Build a dynamic TOC/sidebar tree using Obsidian's metadata cache (e.g., folders and [[links]]); support up to 5 levels of nesting; auto-generate anchors for jumps.
- FR-3: Plugin Output Integration: Render each note in a temporary MarkdownView (preview mode) to capture post-processed HTML (e.g., Dataview, Kanban); whitelist common plugins via settings; fallback to raw Markdown for unsupported ones.
- FR-4: Asset Embedding: Inline images/PDFs as WebP (compressed); resolve embeds; exclude unused files via graph analysis.

### 6.2 UI and Interaction

- FR-5: SPA-Like Structure: Single-page layout with:
  - Left sidebar: Collapsible tree nav (inspired by portfolio sidebars), dark-themed, sans-serif typography.
  - Main content: Scrollable area with section-based rendering; anchor links for nesting.
  - Header: Minimal bar with search input and theme toggle (light/dark).
- FR-6: Animations and Transitions: CSS-based fades/slides for section loads (e.g., on sidebar click); subtle hover effects on nav items, mimicking smooth portfolio reveals.
- FR-7: Search and Extras: Global full-text search across notes; optional graph view (toggled off by default for size).

### 6.3 Settings and Customization

- FR-8: Plugin Settings Tab: Options for lean mode, included plugins, image thresholds (<100KB embed, else warn), and theme export.

## 7. Non-Functional Requirements

### 7.1 Performance and Optimization

- NFR-1: File Size: Target <1MB per 50 notes; use minification (Terser/CleanCSS), WebP conversion (Sharp lib), tree-shaking, and lazy-loading for images/scripts.
- NFR-2: Load Time: Initial parse <1s; full render <3s; tested on Chrome/Firefox/Safari (latest).
- NFR-3: Compatibility: Vanilla JS/CSS (no frameworks like React for leanness); responsive for desktop/mobile.

### 7.2 Security and Reliability

- NFR-4: Self-Contained: No external dependencies; sanitize rendered HTML to prevent XSS.
- NFR-5: Error Handling: Graceful fallbacks (e.g., "Plugin X not rendered"); log to console.

### 7.3 Accessibility

- NFR-6: WCAG 2.1 AA: Semantic HTML, ARIA labels for tree/nav, keyboard navigation, high-contrast mode.

## 8. Design and UI Guidelines

Inspired by the "Viking" project showcase on Emrah Gurkan's portfolio ([https://emrah.ca/onair/Projects/Animation+%2B+Design](https://emrah.ca/onair/Projects/Animation+%2B+Design)), the design evokes a sleek animation/design portfolio:

- Layout: Fixed left sidebar (20% width, collapsible on mobile) for nav tree; full-width main content with vertical scroll; minimal header.
- Visual Style: Dark mode default (black/gray background, white text); accent colors: Deep blue (#1a1a2e) for links/hovers, gold (#f0c14b) for highlights (nod to Viking theme).
- Typography: Sans-serif (e.g., Inter or system-ui); H1-H3 for note titles, body 16px; line-height 1.6.
- Animations: CSS transitions (0.3s ease) for sidebar expand/collapse and content fades; no heavy JS libs.
- Content Presentation: Notes as scrollable sections with borders/shadows; nested subnotes indented in tree; images scaled responsively.
- Mockup Reference: Sidebar lists projects hierarchically; main area shows animated card reveals on scroll—adapt for note "cards."

(Include wireframes in future iterations: e.g., Figma prototype.)

## 9. Technical Considerations

- Tech Stack: Obsidian Plugin API (TypeScript); Electron Node for image processing (Sharp); no external deps in output HTML.
- Implementation Notes:
  - Rendering: app.workspace.openTemporaryFile() for plugin capture.
  - Optimization: Post-process HTML with html-minifier; base64 only essentials.
  - Testing: Unit tests for export loop; e2e with sample vaults.
- Dependencies: @types/obsidian; optional: sharp for images.
- Risks: Plugin API changes (mitigate via versioning); large vaults (>1K notes) timing out (add progress indicators).

## 10. Timeline and Milestones

- MVP (4 weeks): Basic export + nesting + lean HTML.
- Beta (2 weeks): Plugin integration + animations.
- Release (1 week): Polish, docs, submit to Obsidian community.

## 11. Appendix

- Assumptions: Users have common plugins installed; vault <10GB.
- Glossary: Vault (Obsidian workspace); Subnotes (linked/nested Markdown files).
- References: Obsidian Plugin Docs; Webpage HTML Export source (for inspiration).
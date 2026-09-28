# PRD: Export Statistics Overview

## Problem Statement

When a user exports a note or a wiki as a single self-contained HTML file, the plugin only reports counts (notes, diagrams, code blocks, estimated time). It gives no insight into what actually occupies the resulting file size. Users cannot tell whether a large export is dominated by embedded images, diagrams, code blocks, note text, the bundled app shell (CSS/JavaScript) or the compression encoding overhead, and they cannot compare the export against the original vault data.

This makes it impossible to judge the effect of settings such as image quality, image deduplication, or export compression, and it makes a sudden file-size growth hard to explain.

## Solution

After an export finishes, the plugin can show a statistics modal with an exact size breakdown of the generated file. The modal is shown only when a new setting, "Show export statistics", is enabled (default off).

The overview presents:

- Headline numbers: final output file size, uncompressed HTML size, and (when compression is enabled) the compression encoding overhead.
- A category breakdown of the uncompressed HTML: note markup, images, diagrams, code blocks, CSS and JavaScript, each with bytes and percentage.
- Image bytes broken down by format (e.g. webp, png, jpeg, svg, gif).
- A comparison between original vault source bytes and the embedded/optimized bytes.

All values are measured exactly during rendering and assembly, not estimated.

## User Stories

1. As a user, I want to see the final file size of my export, so that I know how large the file I am about to share is.
2. As a user, I want to see the uncompressed HTML size, so that I can tell how much the compression actually saves.
3. As a user, I want to see the compression encoding overhead (base64/base85), so that I understand how much the text encoding adds back on top of the compressed payload.
4. As a user, I want to see how many bytes each category (note markup, images, diagrams, code blocks, CSS, JavaScript) contributes, so that I know what dominates my file.
5. As a user, I want to see each category's share as a percentage, so that I can quickly identify the main driver at a glance.
6. As a user, I want images broken down by format, so that I can decide whether switching image quality or format would help.
7. As a user, I want to compare original vault source bytes with the embedded/optimized bytes, so that I can see whether optimization and compression are effective.
8. As a user, I want the statistics to reflect the exact export that was just produced, so that the numbers match the downloaded file.
9. As a user, I want the statistics for both wiki exports and single-file exports, so that the feature is consistent regardless of how I export.
10. As a user, I want the statistics modal to appear only when I have enabled the corresponding setting, so that routine exports are not interrupted.
11. As a user, I want to close the statistics modal without affecting the already downloaded file, so that viewing statistics is non-destructive.
12. As a user, I want numbers formatted in readable units (KB/MB), so that large byte counts are easy to parse.
13. As a user, I want the breakdown to add up consistently to the total, so that I can trust the numbers.
14. As a user, I want to see deduplication effects, so that I understand when identical images were embedded only once.
15. As a user, I want to see the total of images embedded versus the number of image references, so that I can spot heavy reuse of identical assets.
16. As a developer, I want the size accounting to be a pure, testable module, so that the numbers can be verified without Obsidian or a DOM.
17. As a developer, I want the compression metadata to come from the same builder that produces the output, so that overhead numbers cannot drift from the actual output.
18. As a user, I want the statistics modal to render quickly even for large exports, so that it does not feel like an extra wait.
19. As a user, I want exports where compression is disabled to still show a meaningful breakdown, so that the feature is useful without compression.
20. As a user, I want the diagram and code block contributions to be measured rather than guessed, so that the category breakdown is trustworthy.

## Implementation Decisions

### Modules

- **Export size ledger (new, pure).** A framework-free collector that accumulates byte contributions during a single export. It exposes methods for recording images (format, original bytes, embedded bytes, cache hit), diagrams (bytes), code blocks (bytes), and the static app shell (CSS bytes, JavaScript bytes), plus setters for final totals (raw HTML bytes, output bytes). `finalize()` produces an immutable report. All arithmetic and aggregation lives here so it can be unit tested in isolation.
- **Export size report (new, pure).** The data model produced by the ledger, together with a `formatBytes` helper and share computation. It exposes totals, per-category bytes and percentages, image bytes grouped by format, the vault-original comparison, deduplication figures, and compression metadata.
- **Compression metadata (extend existing self-extraction module).** The gzip/base64 and gzip/base85 builders additionally return metadata describing the encoding, the compressed payload size, the encoded size and the resulting overhead. The existing string-returning wrapper stays intact so callers that do not need statistics are unaffected.
- **Instrumentation of the rendering pipeline (modify existing renderer and pipeline).** The image processing step records, per unique image, the source byte size and the embedded base64 size together with its MIME format. The render pipeline measures diagram and code block contributions from the rendered page markup after the markdown render and records them per page.
- **Vault-original collection (modify renderer).** Note source bytes are taken from each note's file stat size. Referenced image/asset source bytes are recorded at the point where the source file is read, so original versus embedded is measured consistently.
- **Statistics modal (new UI).** A Svelte component presenting the report as a table with proportional bars, wrapped by an Obsidian modal class following the existing modal wrapper pattern.
- **Setting and wiring (modify settings and both export commands).** A new boolean setting toggles the modal. Both the wiki export and the single-file export open the modal after the download when the setting is enabled.

### Decisions and semantics

- **Mutually exclusive categories:** note markup, images, diagrams, code blocks, CSS, JavaScript. They sum to the uncompressed HTML size. Compression overhead is reported separately and is not part of the uncompressed total.
- **Note markup** is the residual after subtracting measured categories from the uncompressed HTML size, so the breakdown always adds up.
- **Image accounting:** embedded bytes are counted once per unique image (deduplication aware). The report also exposes the number of image references and the deduplication saving (references minus unique embedded bytes).
- **Diagram/code measurement:** measured from the rendered DOM containers after the markdown render. Recognized diagram containers are summed; unrecognized third-party renderers fall back to being part of note markup. This is documented as an approximation boundary.
- **Vault-original** includes note markdown source bytes plus the source bytes of referenced image/asset files.
- **Compression metadata** is taken directly from the builder that produced the output, so raw HTML bytes, output bytes and encoding overhead are consistent with the downloaded file.
- **Formatting:** sizes use binary units (1024) labelled KB/MB with one decimal place.
- **No persistence:** the report is ephemeral and not stored or written to the debug log.
- **Report is read-only:** opening the modal never modifies the exported file.

## Testing Decisions

A good test verifies externally observable behavior of the pure modules: given a sequence of recorded contributions, the finalized report contains the expected bytes, percentages and totals, and the compression metadata matches the actual encoding. Tests must not assert internal helper structure.

Modules to test:

- **Export size ledger:** category accumulation, residual computation for note markup, image grouping by format, deduplication counting, and that percentages sum to approximately 100.
- **Export size report and `formatBytes`:** unit formatting, rounding, zero and negative-adjacent edge cases, empty image map.
- **Self-extraction compression metadata:** for base64 and base85, the encoded size and overhead match the chosen encoding; for the disabled case, overhead is zero and output equals raw HTML.
- **Instrumentation:** with mocked rendering/pipeline, image contributions carry the correct format and original/embedded bytes, and diagram/code measurement adds the expected bytes.

Prior art: the existing self-extraction tests (round-trip and encoding), the content analysis tests (pure parsing), and the renderer tests (mocked rendering pipeline).

UI and command wiring are not covered by automated tests.

## Addendum: Largest Artifacts

In addition to the category breakdown, the modal lists the five largest individual artifacts (notes, images, diagrams and code blocks) ranked by their size in the export as a table with four columns: kind, original name, export type and size. The original name is the source file where one exists (image files, embedded `.excalidraw` diagrams resolved from the embed link or the DOM) and otherwise the source note. The export type is what the artifact becomes in the file: the image format (for example `webp`), `svg` for Excalidraw drawings (other diagram engines keep their type, e.g. `Mermaid`), the code language, or `HTML` for notes. Zero-byte artifacts are ignored. Notes are ranked by their rendered markup excluding inline image data URIs so that embedded images are not counted twice; in non-deduplicated exports a note still shares bytes with the diagrams and code blocks it contains.

## Out of Scope

- A full per-note size breakdown; only the top five artifacts are listed.
- A pre-export size estimate inside the export preview.
- Persisting the report or exporting it as a file.
- Historical comparisons across multiple exports.
- Supporting arbitrary third-party diagram renderers beyond the recognized containers.
- Mobile support.

## Further Notes

- The diagram/code split is the least reliable part of the breakdown; the fallback (unrecognized markup counted as note markup) should be documented in the modal or in the feature documentation.
- For image-heavy exports the encoding overhead is substantial and worth surfacing prominently, since it is the main reason a compressed container can be larger than expected for already-compressed images.
- When compression is disabled, the two headline sizes are identical and overhead is zero; the modal should degrade cleanly.
- The setting name, modal title and all labels are in English, consistent with the rest of the UI.

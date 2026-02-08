<script lang="ts">
  import type { ExportPreviewProps } from './types';
  
  let { metrics, notes, onAction }: ExportPreviewProps = $props();
  
  // Truncate note title to 60 characters
  function truncateTitle(title: string): string {
    return title.length > 60 ? title.slice(0, 60) + '...' : title;
  }
</script>

<div class="export-preview">
  <h2>Export Preview</h2>
  
  <!-- Summary section - single row -->
  <div class="export-preview-summary">
    <span class="summary-icon">📄</span>
    <span class="summary-value">{metrics.totalNotes}</span>
    <span class="summary-label">notes</span>
    <span class="summary-separator">·</span>
    <span class="summary-icon">📊</span>
    <span class="summary-value">{metrics.estimatedDiagrams}</span>
    <span class="summary-label">diagrams</span>
    <span class="summary-separator">·</span>
    <span class="summary-icon">📝</span>
    <span class="summary-value">{metrics.totalCodeBlocks}</span>
    <span class="summary-label">code blocks</span>
  </div>
  
  <!-- Notes list - show ALL notes with scroll -->
  {#if notes.length > 0}
    <div class="export-notes-preview">
      <h3 class="export-section-title">Notes</h3>
      <div class="notes-list">
        {#each notes as note, index}
          <div class="preview-note-item" class:last={index === notes.length - 1}>
            <span class="note-name" title={note.title}>
              {truncateTitle(note.title)}
            </span>
            <span class="note-meta">
              {note.estimatedDiagrams} 📊 · {note.linkCount} 🔗
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
  
  <!-- Buttons -->
  <div class="export-preview-buttons">
    <button class="mod-cta" onclick={() => onAction('cancel')}>
      Cancel
    </button>
    <button class="mod-cta" onclick={() => onAction('selectNotes')}>
      Select Notes
    </button>
    <button class="mod-warning" onclick={() => onAction('exportAll')}>
      Export All
    </button>
  </div>
</div>

<style>
  .export-preview {
    padding: 0;
  }
  
  h2 {
    margin-top: 0;
    margin-bottom: 20px;
  }
  
  .export-preview-summary {
    background: var(--background-modifier-form-field);
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 20px;
    text-align: center;
    font-size: 1.1em;
  }
  
  .summary-icon {
    font-size: 1.3em;
    margin-right: 4px;
  }
  
  .summary-value {
    font-weight: 600;
  }
  
  .summary-label {
    color: var(--text-muted);
    margin-right: 8px;
  }
  
  .summary-separator {
    margin: 0 12px;
    color: var(--text-muted);
  }
  
  .export-section-title {
    margin-top: 20px;
    margin-bottom: 12px;
  }
  
  .notes-list {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 8px;
  }
  
  .preview-note-item {
    padding: 6px 8px;
    border-bottom: 1px solid var(--background-modifier-border);
    font-size: 0.9em;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .preview-note-item.last {
    border-bottom: none;
  }
  
  .note-name {
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .note-meta {
    color: var(--text-muted);
    font-size: 0.85em;
  }
  
  .export-preview-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  button {
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.15s;
  }
  
  button.mod-cta {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }
  
  button.mod-cta:hover {
    background-color: var(--interactive-accent-hover);
  }
  
  button.mod-warning {
    background-color: var(--background-modifier-error);
    color: var(--text-error);
  }
  
  button.mod-warning:hover {
    background-color: var(--interactive-normal);
  }
</style>

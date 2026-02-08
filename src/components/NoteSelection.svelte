<script lang="ts">
  import type { NoteSelectionProps } from './types';
  
  let { notes, onConfirm, onCancel }: NoteSelectionProps = $props();
  
  // State
  let searchTerm = $state('');
  let selectedNotes = $state<Set<string>>(new Set());
  let showWarning = $state(false);
  
  // Initialize selectedNotes when component mounts
  $effect(() => {
    selectedNotes = new Set(notes.map(n => n.path));
  });
  
  // Derived state
  let filteredNotes = $derived(
    notes.filter(note => 
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.path.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );
  
  let selectedCount = $derived(selectedNotes.size);
  
  let sortedNotes = $derived(
    [...notes].sort((a, b) => b.estimatedDiagrams - a.estimatedDiagrams)
  );
  
  let selectedNotesArray = $derived(
    notes.filter(note => selectedNotes.has(note.path))
  );
  
  let totalDiagrams = $derived(
    selectedNotesArray.reduce((sum, n) => sum + n.estimatedDiagrams, 0)
  );
  
  let estimatedMinutes = $derived(
    Math.max(1, Math.ceil(
      (selectedNotesArray.length * 2000 + totalDiagrams * 3000) / 60000
    ))
  );
  
  // Actions
  function toggleNote(path: string) {
    const newSelected = new Set(selectedNotes);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    selectedNotes = newSelected;
  }
  
  function selectAll() {
    selectedNotes = new Set(notes.map(n => n.path));
  }
  
  function selectNone() {
    selectedNotes = new Set();
  }
  
  function selectWithDiagrams() {
    selectedNotes = new Set(
      notes.filter(n => n.estimatedDiagrams > 0).map(n => n.path)
    );
  }
  
  function handleConfirm() {
    if (selectedNotes.size === 0) {
      showWarning = true;
      setTimeout(() => showWarning = false, 3000);
      return;
    }
    onConfirm(selectedNotesArray);
  }
</script>

<div class="note-selection">
  <!-- Header with selection count -->
  <div class="header">
    <h2>Select Notes</h2>
    <span class="selection-count">{selectedCount}/{notes.length} selected</span>
  </div>
  
  <!-- Search box -->
  <div class="search-container">
    <input
      type="text"
      placeholder="Search notes..."
      bind:value={searchTerm}
      class="search-input"
    />
  </div>
  
  <!-- Quick actions -->
  <div class="actions-container">
    <button onclick={selectAll}>Select All</button>
    <button onclick={selectNone}>Select None</button>
    <button onclick={selectWithDiagrams}>With Diagrams Only</button>
  </div>
  
  <!-- Notes list -->
  <div class="notes-list-container">
    {#each sortedNotes as note}
      {#if filteredNotes.includes(note)}
        <div 
          class="note-selection-item"
          onclick={() => toggleNote(note.path)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && toggleNote(note.path)}
        >
          <div class="checkbox-container">
            <input
              type="checkbox"
              checked={selectedNotes.has(note.path)}
              onclick={(e) => { e.stopPropagation(); toggleNote(note.path); }}
            />
          </div>
          
          <div class="note-content">
            <div class="note-title">{note.title}</div>
            <div class="note-path">{note.path}</div>
          </div>
          
          <div class="note-meta">
            {#if note.estimatedDiagrams > 0}
              <span title="{note.estimatedDiagrams} diagrams">📊 {note.estimatedDiagrams}</span>
            {/if}
            <span title="{note.linkCount} links">🔗 {note.linkCount}</span>
          </div>
        </div>
      {/if}
    {/each}
  </div>
  
  <!-- Warning -->
  {#if showWarning}
    <div class="warning">
      Please select at least one note.
    </div>
  {/if}
  
  <!-- Summary footer -->
  <div class="selection-summary">
    <div class="summary-item">
      <div class="summary-value">{selectedCount}</div>
      <div class="summary-label">Selected</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">~{totalDiagrams}</div>
      <div class="summary-label">Diagrams</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">~{estimatedMinutes} min</div>
      <div class="summary-label">Estimated Time</div>
    </div>
  </div>
  
  <!-- Buttons -->
  <div class="button-container">
    <button onclick={onCancel}>Cancel</button>
    <button class="mod-cta" onclick={handleConfirm}>Export</button>
  </div>
</div>

<style>
  .note-selection {
    display: flex;
    flex-direction: column;
    max-height: 80vh;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  
  h2 {
    margin: 0;
  }
  
  .selection-count {
    font-size: 0.9em;
    color: var(--text-muted);
    background: var(--background-modifier-form-field);
    padding: 4px 12px;
    border-radius: 12px;
  }
  
  .search-container {
    margin-bottom: 12px;
  }
  
  .search-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 14px;
  }
  
  .search-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }
  
  .actions-container {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  .actions-container button {
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    font-size: 13px;
  }
  
  .actions-container button:hover {
    background: var(--background-modifier-hover);
  }
  
  .notes-list-container {
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 8px;
    flex: 1;
  }
  
  .note-selection-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--background-modifier-border-hover);
    cursor: pointer;
    transition: background 0.15s;
  }
  
  .note-selection-item:last-child {
    border-bottom: none;
  }
  
  .note-selection-item:hover {
    background: var(--background-modifier-hover);
  }
  
  .checkbox-container {
    display: flex;
    align-items: center;
  }
  
  .checkbox-container input {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
  
  .note-content {
    flex: 1;
    min-width: 0;
  }
  
  .note-title {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .note-path {
    font-size: 0.8em;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .note-meta {
    display: flex;
    gap: 12px;
    font-size: 0.85em;
    color: var(--text-muted);
    white-space: nowrap;
  }
  
  .warning {
    background: var(--background-modifier-error);
    color: var(--text-error);
    padding: 8px 12px;
    border-radius: 4px;
    margin: 12px 0;
    text-align: center;
    font-size: 0.9em;
  }
  
  .selection-summary {
    margin-top: 16px;
    padding: 12px;
    background: var(--background-secondary);
    border-radius: 6px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    text-align: center;
  }
  
  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .summary-value {
    font-size: 1.3em;
    font-weight: 600;
  }
  
  .summary-label {
    font-size: 0.85em;
    color: var(--text-muted);
  }
  
  .button-container {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  .button-container button {
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.15s;
  }
  
  .button-container button.mod-cta {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }
  
  .button-container button.mod-cta:hover {
    background-color: var(--interactive-accent-hover);
  }
  
  .button-container button:not(.mod-cta) {
    background-color: var(--background-modifier-form-field);
    color: var(--text-normal);
  }
  
  .button-container button:not(.mod-cta):hover {
    background-color: var(--background-modifier-hover);
  }
</style>

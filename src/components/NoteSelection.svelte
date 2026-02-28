<script lang="ts">
  import type { NoteSelectionProps } from './types';
  import Icon from './Icon.svelte';

  let { notes, onConfirm, onCancel }: NoteSelectionProps = $props();

  let searchTerm = $state('');
  let selectedNotes = $state<Set<string>>(new Set());
  let showWarning = $state(false);

  $effect(() => {
    selectedNotes = new Set(notes.map(n => n.path));
  });

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

  function handleBack() {
    onCancel();
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

<div data-tags="ns-container" class="flex flex-col">
  <header data-tags="ns-header" class="flex justify-between items-center mb-4">
    <h2 class="m-0 text-obsidian font-semibold">Select notes</h2>
    <span class="text-obsidian-sm text-obsidian-muted bg-obsidian-alt px-3 py-1 rounded-full">
      {selectedCount}/{notes.length} selected
    </span>
  </header>

  <aside data-tags="ns-search" class="mb-3">
    <input
      type="text"
      placeholder="Search notes..."
      bind:value={searchTerm}
      class="obsidian-input"
    />
  </aside>

  <section data-tags="ns-actions" class="flex gap-2 pb-3 mb-3 border-b border-dimmed">
    <button class="obsidian-btn" onclick={selectAll}>Select all</button>
    <button class="obsidian-btn" onclick={selectNone}>Select none</button>
    <button class="obsidian-btn" onclick={selectWithDiagrams}>With diagrams only</button>
  </section>

  <main data-tags="ns-list" class="max-h-[400px] overflow-y-auto border-obsidian rounded p-2 flex-1">
    {#each sortedNotes as note}
      {#if filteredNotes.includes(note)}
        <div class="note-list-item cursor-pointer" onclick={() => toggleNote(note.path)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && toggleNote(note.path)}>
          <input type="checkbox" checked={selectedNotes.has(note.path)} onclick={(e) => { e.stopPropagation(); toggleNote(note.path); }} class="w-4 h-4 cursor-pointer" />
          <div class="flex-1 min-w-0">
            <div class="whitespace-nowrap overflow-hidden text-ellipsis">
              {note.title}
            </div>
            <div class="text-obsidian-muted whitespace-nowrap overflow-hidden text-ellipsis">
              {note.path}
            </div>
          </div>
          <span class="text-obsidian-muted">
            {#if note.estimatedDiagrams > 0}
              <Icon name="chart-bar" size="1em" />{note.estimatedDiagrams}
            {/if}
            <Icon name="link" size="1em" />{note.linkCount}
          </span>
        </div>
      {/if}
    {/each}
  </main>

  {#if showWarning}
    <div data-tags="ns-warning" class="my-3 p-2 rounded text-center text-obsidian-sm" style="background-color: var(--background-modifier-error); color: var(--text-error);">
      Please select at least one note.
    </div>
  {/if}

  <section data-tags="ns-summary" class="mt-4 p-3 bg-obsidian-alt rounded grid grid-cols-3 gap-3 text-center">
    <div class="flex flex-col gap-1">
      <div class="text-obsidian font-semibold">{selectedCount}</div>
      <div class="text-obsidian-xs text-obsidian-muted">Selected</div>
    </div>
    <div class="flex flex-col gap-1">
      <div class="text-obsidian font-semibold">~{totalDiagrams}</div>
      <div class="text-obsidian-xs text-obsidian-muted">Diagrams</div>
    </div>
    <div class="flex flex-col gap-1">
      <div class="text-obsidian font-semibold">~{estimatedMinutes} min</div>
      <div class="text-obsidian-xs text-obsidian-muted">Estimated time</div>
    </div>
  </section>

  <footer data-tags="ns-footer" class="flex justify-end gap-3 mt-5 pt-4 border-t border-dimmed">
    <button class="obsidian-btn" onclick={handleBack}>Cancel</button>
    <button class="obsidian-btn-primary mod-cta" onclick={handleConfirm}>Export</button>
  </footer>
</div>

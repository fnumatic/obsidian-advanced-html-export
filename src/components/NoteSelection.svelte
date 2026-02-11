<script lang="ts">
  import type { NoteSelectionProps } from './types';

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

  function handleConfirm() {
    if (selectedNotes.size === 0) {
      showWarning = true;
      setTimeout(() => showWarning = false, 3000);
      return;
    }
    onConfirm(selectedNotesArray);
  }
</script>

<div data-tags="ns-container" class="flex flex-col max-h-[80vh]">
  <header data-tags="ns-header" class="flex justify-between items-center mb-4">
    <h2 class="m-0 text-base font-semibold">Select Notes</h2>
    <span class="text-sm text-obsidian-muted bg-obsidian-alt px-3 py-1 rounded-full">
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

  <section data-tags="ns-actions" class="flex gap-2 pb-3 mb-3 border-b border-obsidian-border">
    <button class="obsidian-btn" onclick={selectAll}>Select All</button>
    <button class="obsidian-btn" onclick={selectNone}>Select None</button>
    <button class="obsidian-btn" onclick={selectWithDiagrams}>With Diagrams Only</button>
  </section>

  <main data-tags="ns-list" class="max-h-[400px] overflow-y-auto border-obsidian rounded p-2 flex-1">
    {#each sortedNotes as note}
      {#if filteredNotes.includes(note)}
        <div
          class="flex items-center gap-3 py-2.5 px-3 border-b border-obsidian-border-hover cursor-pointer transition-colors"
          class:border-none={sortedNotes.indexOf(note) === sortedNotes.length - 1}
          onclick={() => toggleNote(note.path)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && toggleNote(note.path)}
        >
          <input
            type="checkbox"
            checked={selectedNotes.has(note.path)}
            onclick={(e) => { e.stopPropagation(); toggleNote(note.path); }}
            class="w-4 h-4 cursor-pointer"
          />

          <div class="flex-1 min-w-0">
            <div class="font-medium whitespace-nowrap overflow-hidden text-ellipsis text-sm">
              {note.title}
            </div>
            <div class="text-xs text-obsidian-muted whitespace-nowrap overflow-hidden text-ellipsis">
              {note.path}
            </div>
          </div>

          <div class="flex gap-3 text-sm text-obsidian-muted whitespace-nowrap">
            {#if note.estimatedDiagrams > 0}
              <span title="{note.estimatedDiagrams} diagrams">📊 {note.estimatedDiagrams}</span>
            {/if}
            <span title="{note.linkCount} links">🔗 {note.linkCount}</span>
          </div>
        </div>
      {/if}
    {/each}
  </main>

  {#if showWarning}
    <div data-tags="ns-warning" class="my-3 p-2 rounded text-center text-sm" style="background-color: var(--background-modifier-error); color: var(--text-error);">
      Please select at least one note.
    </div>
  {/if}

  <section data-tags="ns-summary" class="mt-4 p-3 bg-obsidian-alt rounded grid grid-cols-3 gap-3 text-center">
    <div class="flex flex-col gap-1">
      <div class="text-xl font-semibold">{selectedCount}</div>
      <div class="text-xs text-obsidian-muted">Selected</div>
    </div>
    <div class="flex flex-col gap-1">
      <div class="text-xl font-semibold">~{totalDiagrams}</div>
      <div class="text-xs text-obsidian-muted">Diagrams</div>
    </div>
    <div class="flex flex-col gap-1">
      <div class="text-xl font-semibold">~{estimatedMinutes} min</div>
      <div class="text-xs text-obsidian-muted">Estimated Time</div>
    </div>
  </section>

  <footer data-tags="ns-footer" class="flex justify-end gap-3 mt-5 pt-4 border-t border-obsidian-border">
    <button class="obsidian-btn" onclick={onCancel}>Cancel</button>
    <button class="obsidian-btn-primary mod-cta" onclick={handleConfirm}>Export</button>
  </footer>
</div>

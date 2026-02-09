<script lang="ts">
  let { note }: { note: { title: string; duration: number; totalDiagrams: number; totalCodeBlocks: number; totalImages: number } } = $props();
  
  function truncate(str: string, len: number): string {
    return str.length > len ? str.slice(0, len) + '...' : str;
  }
</script>

<div class="note-item">
  <div class="note-info">
    <span class="check">✓</span>
    <span class="title" title={note.title}>{truncate(note.title, 50)}</span>
  </div>
  <div class="note-meta">
    {(note.duration / 1000).toFixed(1)}s · 
    {note.totalDiagrams}📊 {note.totalCodeBlocks}📝 {note.totalImages}🖼️
  </div>
</div>

<style>
  .note-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    font-size: 0.8125rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  .note-item:last-child {
    border-bottom: none;
  }
  
  .note-info {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
  }
  
  .check {
    color: var(--text-success);
    flex-shrink: 0;
  }
  
  .title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .note-meta {
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 0.75rem;
  }
</style>

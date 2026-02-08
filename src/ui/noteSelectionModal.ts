import { App, Modal, ButtonComponent, TextComponent } from 'obsidian';
import { NoteInfo } from '../utils/wikiExportOrchestrator';

export class NoteSelectionModal extends Modal {
  private notes: NoteInfo[];
  private selectedNotes: Set<string>;
  private resolvePromise: ((selected: NoteInfo[] | null) => void) | null = null;
  private searchTerm = '';
  private noteItems: Map<string, HTMLElement> = new Map();

  constructor(app: App, notes: NoteInfo[]) {
    super(app);
    this.notes = notes;
    // Initially select all notes
    this.selectedNotes = new Set(notes.map(n => n.path));
  }

  async openAndAwait(): Promise<NoteInfo[] | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Title with selection count
    const headerEl = contentEl.createDiv();
    headerEl.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    `;
    
    headerEl.createEl('h2', { text: 'Select Notes' });
    
    const countEl = headerEl.createSpan('selection-count');
    countEl.style.cssText = `
      font-size: 0.9em;
      color: var(--text-muted);
      background: var(--background-modifier-form-field);
      padding: 4px 12px;
      border-radius: 12px;
    `;
    this.updateSelectionCount(countEl);

    // Search box
    const searchContainer = contentEl.createDiv();
    searchContainer.style.cssText = `
      margin-bottom: 12px;
      display: flex;
      gap: 8px;
    `;

    const searchComponent = new TextComponent(searchContainer);
    searchComponent
      .setPlaceholder('Search notes...')
      .onChange((value) => {
        this.searchTerm = value.toLowerCase();
        this.filterNotes();
      });
    searchComponent.inputEl.style.flex = '1';

    // Quick actions
    const actionsContainer = contentEl.createDiv();
    actionsContainer.style.cssText = `
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--background-modifier-border);
    `;

    new ButtonComponent(actionsContainer)
      .setButtonText('Select All')
      .onClick(() => {
        this.notes.forEach(note => this.selectedNotes.add(note.path));
        this.updateAllCheckboxes();
        this.updateSelectionCount(countEl);
      });

    new ButtonComponent(actionsContainer)
      .setButtonText('Select None')
      .onClick(() => {
        this.selectedNotes.clear();
        this.updateAllCheckboxes();
        this.updateSelectionCount(countEl);
      });

    new ButtonComponent(actionsContainer)
      .setButtonText('With Diagrams Only')
      .onClick(() => {
        this.selectedNotes.clear();
        this.notes
          .filter(n => n.estimatedDiagrams > 0)
          .forEach(n => this.selectedNotes.add(n.path));
        this.updateAllCheckboxes();
        this.updateSelectionCount(countEl);
      });

    // Notes list
    const listContainer = contentEl.createDiv('notes-list-container');
    listContainer.style.cssText = `
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid var(--background-modifier-border);
      border-radius: 8px;
      padding: 8px;
    `;

    // Sort notes by complexity (diagrams desc)
    const sortedNotes = [...this.notes].sort((a, b) => 
      b.estimatedDiagrams - a.estimatedDiagrams
    );

    sortedNotes.forEach((note) => {
      const itemEl = this.createNoteItem(note, countEl);
      listContainer.appendChild(itemEl);
      this.noteItems.set(note.path, itemEl);
    });

    // Summary footer
    const summaryEl = contentEl.createDiv('selection-summary');
    summaryEl.style.cssText = `
      margin-top: 16px;
      padding: 12px;
      background: var(--background-secondary);
      border-radius: 6px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      text-align: center;
    `;

    const updateSummary = () => {
      const selected = this.getSelectedNotes();
      const totalDiagrams = selected.reduce((sum, n) => sum + n.estimatedDiagrams, 0);
      const estimatedMinutes = Math.max(1, Math.ceil(
        (selected.length * 2000 + totalDiagrams * 3000) / 60000
      ));

      summaryEl.empty();
      
      this.createSummaryItem(summaryEl, 'Selected', selected.length.toString());
      this.createSummaryItem(summaryEl, 'Diagrams', `~${totalDiagrams}`);
      this.createSummaryItem(summaryEl, 'Estimated Time', `~${estimatedMinutes} min`);
    };

    updateSummary();

    // Buttons
    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--background-modifier-border);
    `;

    new ButtonComponent(buttonContainer)
      .setButtonText('Cancel')
      .onClick(() => {
        this.resolve?.(null);
        this.close();
      });

    new ButtonComponent(buttonContainer)
      .setButtonText('Export')
      .setCta()
      .onClick(() => {
        const selected = this.getSelectedNotes();
        if (selected.length === 0) {
          // Show warning
          const warningEl = contentEl.createDiv();
          warningEl.style.cssText = `
            background: var(--background-modifier-error);
            color: var(--text-error);
            padding: 8px 12px;
            border-radius: 4px;
            margin-bottom: 12px;
            text-align: center;
          `;
          warningEl.textContent = 'Please select at least one note.';
          
          // Remove after 3 seconds
          setTimeout(() => warningEl.remove(), 3000);
          return;
        }
        
        this.resolve?.(selected);
        this.close();
      });

    // Store update function for later use
    (this as any).updateSummaryFn = updateSummary;
  }

  private createNoteItem(note: NoteInfo, countEl: HTMLElement): HTMLElement {
    const itemEl = document.createElement('div');
    itemEl.className = 'note-selection-item';
    itemEl.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--background-modifier-border-hover);
      cursor: pointer;
      transition: background 0.15s;
    `;
    itemEl.dataset.path = note.path;

    // Hover effect
    itemEl.addEventListener('mouseenter', () => {
      itemEl.style.background = 'var(--background-modifier-hover)';
    });
    itemEl.addEventListener('mouseleave', () => {
      itemEl.style.background = 'transparent';
    });

    // Checkbox
    const checkboxContainer = itemEl.createDiv();
    checkboxContainer.style.cssText = `
      display: flex;
      align-items: center;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.selectedNotes.has(note.path);
    checkbox.style.cssText = `
      width: 18px;
      height: 18px;
      cursor: pointer;
    `;
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        this.selectedNotes.add(note.path);
      } else {
        this.selectedNotes.delete(note.path);
      }
      this.updateSelectionCount(countEl);
      (this as any).updateSummaryFn?.();
    });
    checkboxContainer.appendChild(checkbox);

    // Content
    const contentEl = itemEl.createDiv();
    contentEl.style.cssText = 'flex: 1; min-width: 0;';

    const titleEl = contentEl.createDiv();
    titleEl.style.cssText = `
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    titleEl.textContent = note.title;

    const pathEl = contentEl.createDiv();
    pathEl.style.cssText = `
      font-size: 0.8em;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    pathEl.textContent = note.path;

    // Metadata
    const metaEl = itemEl.createDiv();
    metaEl.style.cssText = `
      display: flex;
      gap: 12px;
      font-size: 0.85em;
      color: var(--text-muted);
      white-space: nowrap;
    `;

    if (note.estimatedDiagrams > 0) {
      const diagramsEl = metaEl.createSpan();
      diagramsEl.innerHTML = `📊 ${note.estimatedDiagrams}`;
      diagramsEl.title = `${note.estimatedDiagrams} diagrams`;
    }

    const linksEl = metaEl.createSpan();
    linksEl.innerHTML = `🔗 ${note.linkCount}`;
    linksEl.title = `${note.linkCount} links`;

    // Click on item toggles checkbox
    itemEl.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    });

    return itemEl;
  }

  private createSummaryItem(container: HTMLElement, label: string, value: string): void {
    const item = container.createDiv();
    item.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    const valueEl = item.createDiv();
    valueEl.style.cssText = 'font-size: 1.3em; font-weight: 600;';
    valueEl.textContent = value;

    const labelEl = item.createDiv();
    labelEl.style.cssText = 'font-size: 0.85em; color: var(--text-muted);';
    labelEl.textContent = label;
  }

  private filterNotes(): void {
    this.noteItems.forEach((itemEl, path) => {
      const note = this.notes.find(n => n.path === path);
      if (!note) return;

      const matches = 
        note.title.toLowerCase().includes(this.searchTerm) ||
        note.path.toLowerCase().includes(this.searchTerm);

      itemEl.style.display = matches ? 'flex' : 'none';
    });
  }

  private updateAllCheckboxes(): void {
    this.noteItems.forEach((itemEl, path) => {
      const checkbox = itemEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = this.selectedNotes.has(path);
      }
    });
    (this as any).updateSummaryFn?.();
  }

  private updateSelectionCount(element: HTMLElement): void {
    element.textContent = `${this.selectedNotes.size}/${this.notes.length} selected`;
  }

  private getSelectedNotes(): NoteInfo[] {
    return this.notes.filter(note => this.selectedNotes.has(note.path));
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    if (this.resolvePromise) {
      this.resolvePromise(null);
      this.resolvePromise = null;
    }
  }

  private get resolve(): ((selected: NoteInfo[] | null) => void) | null {
    return this.resolvePromise;
  }
}

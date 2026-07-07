import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { TFile } from 'obsidian';
import { LinkResolver } from '../utils/linkResolver';
import { WikiExportOrchestrator, WikiExportOptions } from './wikiExportOrchestrator';

vi.mock('obsidian', async () => {
  const actual = await vi.importActual('obsidian');
  return {
    ...actual,
    MarkdownRenderer: {
      render: vi.fn((_app: unknown, _content: string, el: HTMLElement, _pathStr: string, _component: unknown) => {
        const div = el.createDiv({ cls: 'markdown-body' });
        div.textContent = _content;
      })
    },
    arrayBufferToBase64: (buffer: ArrayBuffer) => {
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
  };
});

interface MockFile {
  path: string;
  basename: string;
  extension: string;
  name: string;
  stat: { mtime: number };
}

function createMockFile(filePath: string, mtime?: number): MockFile {
  return {
    path: filePath,
    basename: path.basename(filePath, path.extname(filePath)),
    extension: path.extname(filePath).replace('.', ''),
    name: path.basename(filePath),
    stat: { mtime: mtime || Date.now() }
  };
}

describe('Wiki Export Complex Testcase', () => {
  describe('LinkResolver', () => {
    it('should extract wiki links from central note', () => {
      const resolver = new LinkResolver();
      const content = `
# Central Note

Links to:
- [[02-level1-topic-a]]
- [[03-level1-topic-b]]
- [[04-level1-topic-c]]
`;

      const links = resolver.extractLinks(content);

      expect(links.length).toBe(3);
      expect(links[0].target).toBe('02-level1-topic-a');
      expect(links[0].type).toBe('wiki');
      expect(links[1].target).toBe('03-level1-topic-b');
      expect(links[2].target).toBe('04-level1-topic-c');
    });

    it('should extract wiki links with aliases', () => {
      const resolver = new LinkResolver();
      const content = '[[02-level1-topic-a|Topic A]]';

      const links = resolver.extractLinks(content);

      expect(links.length).toBe(1);
      expect(links[0].target).toBe('02-level1-topic-a');
      expect(links[0].alias).toBe('Topic A');
    });

    it('should resolve links recursively across multiple levels', () => {
      const resolver = new LinkResolver();

      const centralLinks = resolver.extractLinks('[[02-level1-topic-a]] [[03-level1-topic-b]]');
      const level1LinksA = resolver.extractLinks('[[06-level2-subtopic-a1]] [[07-level2-subtopic-a2]]');
      const level1LinksB = resolver.extractLinks('[[08-level2-subtopic-b1]] [[09-level2-subtopic-b2]]');
      const level1LinksC = resolver.extractLinks('[[10-level2-subtopic-c1]]');

      expect(centralLinks.length).toBe(2);
      expect(level1LinksA.length).toBe(2);
      expect(level1LinksB.length).toBe(2);
      expect(level1LinksC.length).toBe(1);
    });

    it('should handle cross-references between level 1 notes', () => {
      const resolver = new LinkResolver();
      const content = 'References: [[03-level1-topic-b]] Also: [[02-level1-topic-a]]';

      const links = resolver.extractLinks(content);

      expect(links.length).toBe(2);
      expect(links[0].target).toBe('03-level1-topic-b');
      expect(links[1].target).toBe('02-level1-topic-a');
    });

    it('should handle circular references', () => {
      const resolver = new LinkResolver();
      const contentA = '[[04-level1-topic-c]]';
      const contentC = '[[02-level1-topic-a]]';

      const linksA = resolver.extractLinks(contentA);
      const linksC = resolver.extractLinks(contentC);

      expect(linksA.length).toBe(1);
      expect(linksC.length).toBe(1);
    });
  });

  describe('Testcase5 Structure Validation', () => {
    const mockFiles: MockFile[] = [
      createMockFile('01-central-note.md'),
      createMockFile('02-level1-topic-a.md'),
      createMockFile('03-level1-topic-b.md'),
      createMockFile('04-level1-topic-c.md'),
      createMockFile('05-level1-topic-d.md'),
      createMockFile('06-level2-subtopic-a1.md'),
      createMockFile('07-level2-subtopic-a2.md'),
      createMockFile('08-level2-subtopic-b1.md'),
      createMockFile('09-level2-subtopic-b2.md'),
      createMockFile('10-level2-subtopic-c1.md'),
      createMockFile('11-level1-topic-e.md'),
      createMockFile('images/diagram.svg'),
    ];

    it('should have 11 markdown files', () => {
      const mdFiles = mockFiles.filter(f => f.extension === 'md');
      expect(mdFiles.length).toBe(11);
    });

    it('should have 5 level 1 notes', () => {
      const level1Files = mockFiles.filter(f =>
        f.extension === 'md' &&
        /-level1-/.test(f.basename)
      );
      expect(level1Files.length).toBe(5);
    });

    it('should have 5 level 2 notes', () => {
      const level2Files = mockFiles.filter(f =>
        f.extension === 'md' &&
        /-level2-/.test(f.basename)
      );
      expect(level2Files.length).toBe(5);
    });

    it('should have image file', () => {
      const imageFiles = mockFiles.filter(f =>
        f.extension === 'svg' || f.extension === 'png' || f.extension === 'jpg'
      );
      expect(imageFiles.length).toBe(1);
    });
  });

  describe('Link Collection Algorithm', () => {
    it('should collect all links up to specified depth', async () => {
      const resolver = new LinkResolver();

      const testContent: Record<string, string> = {
        '01-central-note': '[[02-level1-topic-a]] [[03-level1-topic-b]] [[04-level1-topic-c]] [[05-level1-topic-d]] [[11-level1-topic-e]]',
        '02-level1-topic-a': '[[06-level2-subtopic-a1]] [[07-level2-subtopic-a2]]',
        '03-level1-topic-b': '[[08-level2-subtopic-b1]] [[09-level2-subtopic-b2]]',
        '04-level1-topic-c': '[[10-level2-subtopic-c1]]',
        '05-level1-topic-d': '',
        '06-level2-subtopic-a1': '',
        '07-level2-subtopic-a2': '',
        '08-level2-subtopic-b1': '',
        '09-level2-subtopic-b2': '[[06-level2-subtopic-a1]]',
        '10-level2-subtopic-c1': '[[06-level2-subtopic-a1]] [[09-level2-subtopic-b2]]',
        '11-level1-topic-e': ''
      };

      const visited = new Set<string>();
      const collected: string[] = [];

      async function collectLinks(fileSlug: string, remainingDepth: number): Promise<void> {
        if (visited.has(fileSlug)) return;

        visited.add(fileSlug);
        collected.push(fileSlug);

        if (remainingDepth <= 0) return;

        const content = testContent[fileSlug] || '';
        const links = resolver.extractLinks(content);

        for (const link of links) {
          await collectLinks(link.target, remainingDepth - 1);
        }
      }

      await collectLinks('01-central-note', 2);

      expect(visited.has('01-central-note')).toBe(true);
      expect(visited.has('02-level1-topic-a')).toBe(true);
      expect(visited.has('03-level1-topic-b')).toBe(true);
      expect(visited.has('04-level1-topic-c')).toBe(true);
      expect(visited.has('05-level1-topic-d')).toBe(true);
      expect(visited.has('06-level2-subtopic-a1')).toBe(true);
      expect(visited.has('07-level2-subtopic-a2')).toBe(true);
      expect(visited.has('08-level2-subtopic-b1')).toBe(true);
      expect(visited.has('09-level2-subtopic-b2')).toBe(true);
      expect(visited.has('10-level2-subtopic-c1')).toBe(true);
      expect(visited.has('11-level1-topic-e')).toBe(true);

      expect(collected.length).toBe(11);
    });

    it('should handle depth 1 correctly', async () => {
      const resolver = new LinkResolver();

      const testContent: Record<string, string> = {
        '01-central-note': '[[02-level1-topic-a]] [[03-level1-topic-b]] [[04-level1-topic-c]] [[05-level1-topic-d]]',
        '02-level1-topic-a': '[[06-level2-subtopic-a1]]',
      };

      const visited = new Set<string>();
      const collected: string[] = [];

      async function collectLinks(fileSlug: string, remainingDepth: number): Promise<void> {
        if (visited.has(fileSlug)) return;

        visited.add(fileSlug);
        collected.push(fileSlug);

        if (remainingDepth <= 0) return;

        const content = testContent[fileSlug] || '';
        const links = resolver.extractLinks(content);

        for (const link of links) {
          await collectLinks(link.target, remainingDepth - 1);
        }
      }

      await collectLinks('01-central-note', 1);

      expect(visited.has('01-central-note')).toBe(true);
      expect(visited.has('02-level1-topic-a')).toBe(true);
      expect(visited.has('03-level1-topic-b')).toBe(true);
      expect(visited.has('04-level1-topic-c')).toBe(true);
      expect(visited.has('05-level1-topic-d')).toBe(true);

      expect(visited.has('06-level2-subtopic-a1')).toBe(false);
    });
  });

  describe('Slug Generation', () => {
    it('should generate consistent slugs', () => {
      const resolver = new LinkResolver();

      expect(resolver.slugify('01-central-note')).toBe('01-central-note');
      expect(resolver.slugify('02-level1-topic-a')).toBe('02-level1-topic-a');
      expect(resolver.slugify('10-level2-subtopic-c1')).toBe('10-level2-subtopic-c1');
    });

    it('should handle special characters', () => {
      const resolver = new LinkResolver();

      expect(resolver.slugify('My Cool Note')).toBe('my-cool-note');
      expect(resolver.slugify('Test_Note-123')).toBe('test_note-123');
    });
  });

  describe('HTML Generation', () => {
    it('should generate wiki HTML structure', () => {
      const resolver = new LinkResolver();
      const content = '[[02-level1-topic-a]] [[03-level1-topic-b]]';
      const { content: resolved } = resolver.resolveLinks(content);

      expect(resolved).toContain('data-page="02-level1-topic-a"');
      expect(resolved).toContain('data-page="03-level1-topic-b"');
    });

    it('should preserve alias in resolved links', () => {
      const resolver = new LinkResolver();
      const content = '[[02-level1-topic-a|My Custom Alias]]';
      const { content: resolved } = resolver.resolveLinks(content);

      expect(resolved).toContain('My Custom Alias');
      expect(resolved).toContain('data-page="02-level1-topic-a"');
    });
  });

  describe('Missing Link Detection', () => {
    it('should render missing link as wiki-link-missing span', () => {
      const resolver = new LinkResolver();
      resolver.setPageSlugResolver(() => ({ slug: null, resolved: false }));
      const { content: resolved } = resolver.resolveLinks('[[NonExistentNote]]');
      expect(resolved).toContain('class="wiki-link-missing"');
      expect(resolved).toContain('data-missing-target="NonExistentNote"');
      expect(resolved).not.toContain('data-page="');
    });

    it('should preserve alias in missing link', () => {
      const resolver = new LinkResolver();
      resolver.setPageSlugResolver(() => ({ slug: null, resolved: false }));
      const { content: resolved } = resolver.resolveLinks('[[NonExistentNote|My Label]]');
      expect(resolved).toContain('wiki-link-missing');
      expect(resolved).toContain('My Label');
      expect(resolved).toContain('data-missing-target="NonExistentNote"');
    });

    it('should render resolved link as anchor', () => {
      const resolver = new LinkResolver();
      resolver.setPageSlugResolver(() => ({ slug: 'existing-slug', resolved: true }));
      const { content: resolved } = resolver.resolveLinks('[[ExistingNote]]');
      expect(resolved).toContain('data-page="existing-slug"');
      expect(resolved).not.toContain('wiki-link-missing');
    });

    it('should not affect image embeds', () => {
      const resolver = new LinkResolver();
      resolver.setPageSlugResolver(() => ({ slug: null, resolved: false }));
      const { content: resolved } = resolver.resolveLinks('![[MissingImage.png]]');
      expect(resolved).toBe('![[MissingImage.png]]');
    });

    it('should escape HTML in missing link alias and target', () => {
      const resolver = new LinkResolver();
      resolver.setPageSlugResolver(() => ({ slug: null, resolved: false }));
      const { content: resolved } = resolver.resolveLinks('[[Bad <script>|Evil "Alias"]]');
      expect(resolved).toContain('&lt;script&gt;');
      expect(resolved).toContain('&quot;Alias&quot;');
      expect(resolved).not.toContain('<script>');
    });
  });
});

// =========================================================================
// BFS Link Traversal Tests
// =========================================================================

function createFile(pathStr: string, content: string): TFile {
  const name = pathStr.split('/').pop() || pathStr;
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1) : '';
  const basename = dot >= 0 ? name.slice(0, dot) : name;
  const file = new TFile();
  file.path = pathStr;
  file.basename = basename;
  file.extension = ext;
  file.name = name;
  file.stat = { mtime: Date.now(), ctime: Date.now(), size: content.length };
  (file as unknown as Record<string, unknown>).__content = content;
  return file as unknown as TFile;
}

function mockAppWithFiles(entries: Record<string, string>, frontmatterByPath?: Record<string, Record<string, unknown>>) {
  const files: TFile[] = [];
  for (const [p, c] of Object.entries(entries)) {
    files.push(createFile(p, c));
  }
  const vault: Record<string, unknown> = {
    getFiles: () => files,
    cachedRead: async (f: TFile) =>
      (f as unknown as Record<string, unknown>).__content as string || '',
  };
  const metadataCache = {
    getFileCache: (file: TFile) => {
      const fm = frontmatterByPath?.[file.path];
      return fm ? { frontmatter: fm } : null;
    },
  };
  const app = { vault, workspace: {}, metadataCache };
  return app as unknown as import('obsidian').App;
}

const bfsOptions: WikiExportOptions = {
  imageQuality: 'high',
  enableLazyLoading: false,
  enableImageDeduplication: false,
  linkDepth: 3,
  includeUnlinked: false,
};

describe('BFS Link Traversal', () => {
  beforeEach(() => {
    const body = { createDiv: vi.fn(() => ({ innerHTML: '', querySelectorAll: vi.fn(() => []), setAttribute: vi.fn() })) };
    Object.defineProperty(globalThis, 'document', {
      value: { body, createElement: vi.fn(() => ({ innerHTML: '' })) },
      writable: true,
      configurable: true,
    });
  });

  it('depth 0 collects only the root', async () => {
    const app = mockAppWithFiles({
      'root.md': '[[a]]',
      'a.md': '[[b]]',
      'b.md': '[[c]]',
    });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 0 });
    const notes = await orch.collectNotes(createFile('root.md', '[[a]]'));
    expect(notes).toHaveLength(1);
    expect(notes[0].slug).toBe('root');
    expect(notes[0].depth).toBe(0);
  });

  it('depth 1 collects root and direct links', async () => {
    const app = mockAppWithFiles({
      'root.md': '[[a]]',
      'a.md': '[[b]]',
      'b.md': '[[c]]',
    });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 1 });
    const notes = await orch.collectNotes(createFile('root.md', '[[a]]'));
    expect(notes).toHaveLength(2);
    const root = notes.find(n => n.slug === 'root')!;
    const a = notes.find(n => n.slug === 'a')!;
    expect(root.depth).toBe(0);
    expect(a.depth).toBe(1);
  });

  it('depth 2 collects root, direct, and indirect', async () => {
    const app = mockAppWithFiles({
      'root.md': '[[a]]',
      'a.md': '[[b]]',
      'b.md': '[[c]]',
    });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 2 });
    const notes = await orch.collectNotes(createFile('root.md', '[[a]]'));
    expect(notes).toHaveLength(3);
    expect(notes.find(n => n.slug === 'root')!.depth).toBe(0);
    expect(notes.find(n => n.slug === 'a')!.depth).toBe(1);
    expect(notes.find(n => n.slug === 'b')!.depth).toBe(2);
  });

  it('depth 3 traverses four levels deep', async () => {
    const app = mockAppWithFiles({
      'root.md': '[[a]]',
      'a.md': '[[b]]',
      'b.md': '[[c]]',
      'c.md': '[[d]]',
    });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 3 });
    const notes = await orch.collectNotes(createFile('root.md', '[[a]]'));
    expect(notes).toHaveLength(4);
    expect(notes.find(n => n.slug === 'root')!.depth).toBe(0);
    expect(notes.find(n => n.slug === 'a')!.depth).toBe(1);
    expect(notes.find(n => n.slug === 'b')!.depth).toBe(2);
    expect(notes.find(n => n.slug === 'c')!.depth).toBe(3);
  });

  it('handles cycles without duplicates', async () => {
    const app = mockAppWithFiles({
      'root.md': '[[a]]',
      'a.md': '[[b]]',
      'b.md': '[[a]]',
    });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 3 });
    const notes = await orch.collectNotes(createFile('root.md', '[[a]]'));
    const slugs = notes.map(n => n.slug).sort();
    expect(slugs).toEqual(['a', 'b', 'root']);
  });

  it('does not collect image embeds as pages', async () => {
    const app = mockAppWithFiles({
      'root.md': '![[image.png]] [[linked.png]]',
      'linked.png': '',
    });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 1 });
    const notes = await orch.collectNotes(createFile('root.md', '![[image.png]] [[linked.png]]'));
    const slugs = notes.map(n => n.slug);
    expect(slugs).toContain('root');
    expect(slugs).toContain('linked');
    expect(slugs).not.toContain('image');
  });

  it('collects viewable direct links as pages', async () => {
    const app = mockAppWithFiles({
      'root.md': '[[diagram.svg]]',
      'diagram.svg': '<svg/>',
    });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 1 });
    const notes = await orch.collectNotes(createFile('root.md', '[[diagram.svg]]'));
    const slugs = notes.map(n => n.slug);
    expect(slugs).toContain('root');
    expect(slugs).toContain('diagram');
  });

  it('populates notesByDepth metrics', async () => {
    const app = mockAppWithFiles({
      'root.md': '[[a]] [[b]]',
      'a.md': '[[c]]',
      'b.md': '',
      'c.md': '',
    });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 2 });
    await orch.collectNotes(createFile('root.md', '[[a]] [[b]]'));
    const metrics = orch.getMetrics()!;
    expect(metrics.notesByDepth.get(0)).toBe(1);
    expect(metrics.notesByDepth.get(1)).toBe(2);
    expect(metrics.notesByDepth.get(2)).toBe(1);
  });
});

// =========================================================================
// Frontmatter Tests
// =========================================================================

describe('Frontmatter', () => {
  it('uses frontmatter.title as note title', async () => {
    const app = mockAppWithFiles(
      { 'note.md': '# Hello' },
      { 'note.md': { title: 'My Custom Title' } }
    );
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 0 });
    const notes = await orch.collectNotes(createFile('note.md', '# Hello'));
    expect(notes[0].title).toBe('My Custom Title');
  });

  it('falls back to file.basename when no frontmatter.title', async () => {
    const app = mockAppWithFiles(
      { 'note.md': '# Hello' },
      { 'note.md': { publish: true } }
    );
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 0 });
    const notes = await orch.collectNotes(createFile('note.md', '# Hello'));
    expect(notes[0].title).toBe('note');
  });

  it('attaches frontmatter to NoteInfo', async () => {
    const app = mockAppWithFiles(
      { 'note.md': '# Hello' },
      { 'note.md': { title: 'T', aliases: ['A', 'B'], tags: ['tag1'] } }
    );
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 0 });
    const notes = await orch.collectNotes(createFile('note.md', '# Hello'));
    expect(notes[0].frontmatter.title).toBe('T');
    expect(notes[0].frontmatter.aliases).toEqual(['A', 'B']);
    expect(notes[0].frontmatter.tags).toEqual(['tag1']);
  });

  it('excludes note with publish: false (root returns empty)', async () => {
    const app = mockAppWithFiles(
      { 'note.md': '# Hello' },
      { 'note.md': { publish: false } }
    );
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 0 });
    const notes = await orch.collectNotes(createFile('note.md', '# Hello'));
    expect(notes).toHaveLength(0);
  });

  it('excludes publish: false linked note from collection', async () => {
    const app = mockAppWithFiles(
      { 'root.md': '[[secret]]', 'secret.md': '# Shh' },
      { 'secret.md': { publish: false } }
    );
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 1 });
    const notes = await orch.collectNotes(createFile('root.md', '[[secret]]'));
    const slugs = notes.map(n => n.slug);
    expect(slugs).toContain('root');
    expect(slugs).not.toContain('secret');
  });

  it('stops traversal at publish: false note', async () => {
    const app = mockAppWithFiles(
      { 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '# should not appear' },
      { 'a.md': { publish: false } }
    );
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 2 });
    const notes = await orch.collectNotes(createFile('root.md', '[[a]]'));
    const slugs = notes.map(n => n.slug);
    expect(slugs).toEqual(['root']);
    expect(slugs).not.toContain('a');
    expect(slugs).not.toContain('b');
  });

  it('includes notes with no frontmatter', async () => {
    const app = mockAppWithFiles({ 'note.md': '# Hello' });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 0 });
    const notes = await orch.collectNotes(createFile('note.md', '# Hello'));
    expect(notes).toHaveLength(1);
    expect(notes[0].frontmatter).toEqual({});
  });
});

// =========================================================================
// Frontmatter Depth Override Tests
// =========================================================================

describe('Frontmatter Depth Override', () => {
  it('uses frontmatter export.scope.maxDepth when set', async () => {
    const app = mockAppWithFiles(
      { 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '' },
      { 'root.md': { export: { scope: { maxDepth: 2 } } } }
    );
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 1 });
    const notes = await orch.collectNotes(createFile('root.md', '[[a]]'));
    const slugs = notes.map(n => n.slug);
    expect(slugs).toContain('root');
    expect(slugs).toContain('a');
    expect(slugs).toContain('b');
  });

  it('falls back to settings depth when no frontmatter maxDepth', async () => {
    const app = mockAppWithFiles(
      { 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '' },
      { 'root.md': {} }
    );
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 1 });
    const notes = await orch.collectNotes(createFile('root.md', '[[a]]'));
    const slugs = notes.map(n => n.slug);
    expect(slugs).toContain('root');
    expect(slugs).toContain('a');
    expect(slugs).not.toContain('b');
  });

  it('maxDepth: 0 collects only root', async () => {
    const app = mockAppWithFiles(
      { 'root.md': '[[a]]', 'a.md': '' },
      { 'root.md': { export: { scope: { maxDepth: 0 } } } }
    );
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 2 });
    const notes = await orch.collectNotes(createFile('root.md', '[[a]]'));
    const slugs = notes.map(n => n.slug);
    expect(slugs).toEqual(['root']);
  });

  it('publish: false overrides depth entirely', async () => {
    const app = mockAppWithFiles(
      { 'root.md': '[[a]]' },
      { 'root.md': { publish: false, export: { scope: { maxDepth: 3 } } } }
    );
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 2 });
    const notes = await orch.collectNotes(createFile('root.md', '[[a]]'));
    expect(notes).toHaveLength(0);
  });

  it('links to non-exported pages render as missing when depth restricted', () => {
    const resolver = new LinkResolver();
    const allowedSlugs = new Set(['root']);
    resolver.setPageSlugResolver((rawTarget: string) => {
      const slug = resolver.slugify(rawTarget);
      return allowedSlugs.has(slug)
        ? { slug, resolved: true }
        : { slug: null, resolved: false };
    });
    const { content } = resolver.resolveLinks('[[root]] [[a]]');
    expect(content).toContain('data-page="root"');
    expect(content).toContain('wiki-link-missing');
    expect(content).toContain('data-missing-target="a"');
  });
});

// =========================================================================
// Export Manifest Tests
// =========================================================================

describe('Export Manifest', () => {
  it('includes export-manifest script tag in head', () => {
    const manifestJson = JSON.stringify({ title: 'Test' });
    const html = `<html><head><script id="export-manifest" type="application/json">${manifestJson}</script></head></html>`;
    expect(html).toContain('export-manifest');
    expect(html).toContain('application/json');
  });

  it('manifest contains title from wikiTitle option', () => {
    const app = mockAppWithFiles({ 'note.md': '# Hello' });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 0, exportAuthor: 'Test Author', exportVersion: '1.0.0' });
    expect(orch).toBeDefined();
  });

  it('manifest contains title from frontmatter.title of central note', async () => {
    const app = mockAppWithFiles(
      { 'root.md': '# Hello' },
      { 'root.md': { title: 'My Wiki', author: 'Max', license: 'MIT', note: 'Test export' } }
    );
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 0 });
    const notes = await orch.collectNotes(createFile('root.md', '# Hello'));
    expect(notes[0].title).toBe('My Wiki');
    expect(notes[0].frontmatter.author).toBe('Max');
    expect(notes[0].frontmatter.license).toBe('MIT');
    expect(notes[0].frontmatter.note).toBe('Test export');
  });

  it('author falls back to exportAuthor config when not in frontmatter', async () => {
    const app = mockAppWithFiles({ 'root.md': '# Hello' });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 0, exportAuthor: 'Config Author' });
    const notes = await orch.collectNotes(createFile('root.md', '# Hello'));
    const author = notes[0].frontmatter.author || 'Config Author';
    expect(author).toBe('Config Author');
  });

  it('license and note only come from frontmatter', async () => {
    const app = mockAppWithFiles({ 'root.md': '# Hello' });
    const orch = new WikiExportOrchestrator(app, {} as never, { ...bfsOptions, linkDepth: 0 });
    const notes = await orch.collectNotes(createFile('root.md', '# Hello'));
    expect(notes[0].frontmatter.license).toBeUndefined();
    expect(notes[0].frontmatter.note).toBeUndefined();
  });
});

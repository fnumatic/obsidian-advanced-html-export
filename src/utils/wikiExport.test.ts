import { describe, it, expect, beforeEach } from 'vitest';
import { WikiExportOrchestrator, WikiExportOptions } from './wikiExportOrchestrator';
import { createMockFile, installMockDocument, mockAppWithFiles } from './test-utils';

const options: WikiExportOptions = {
  imageQuality: 'high',
  enableLazyLoading: false,
  enableImageDeduplication: false,
  linkDepth: 3,
  includeUnlinked: false,
};

type MockApp = ReturnType<typeof mockAppWithFiles>['app'];

function collectNotes(app: MockApp, rootPath: string, rootContent: string, depth: number) {
  const orchestrator = new WikiExportOrchestrator(app, {} as never, { ...options, linkDepth: depth });
  return orchestrator.collectNotes(createMockFile(rootPath, rootContent));
}

describe('WikiExportOrchestrator link collection', () => {
  beforeEach(installMockDocument);

  it('depth 0 collects only the root', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '[[c]]' });
    const notes = await collectNotes(app, 'root.md', '[[a]]', 0);
    expect(notes).toHaveLength(1);
    expect(notes[0].depth).toBe(0);
  });

  it('depth 1 collects root and direct links', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '[[c]]' });
    const notes = await collectNotes(app, 'root.md', '[[a]]', 1);
    expect(notes.map(n => n.slug).sort()).toEqual(['a', 'root']);
    expect(notes.find(n => n.slug === 'a')!.depth).toBe(1);
  });

  it('depth 2 collects root, direct and indirect links', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '[[c]]' });
    const notes = await collectNotes(app, 'root.md', '[[a]]', 2);
    expect(notes.map(n => n.slug).sort()).toEqual(['a', 'b', 'root']);
    expect(notes.find(n => n.slug === 'b')!.depth).toBe(2);
  });

  it('depth 3 traverses four levels deep', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '[[c]]', 'c.md': '[[d]]' });
    const notes = await collectNotes(app, 'root.md', '[[a]]', 3);
    expect(notes).toHaveLength(4);
    expect(notes.find(n => n.slug === 'c')!.depth).toBe(3);
  });

  it('handles cycles without duplicates', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '[[a]]' });
    const notes = await collectNotes(app, 'root.md', '[[a]]', 3);
    expect(notes.map(n => n.slug).sort()).toEqual(['a', 'b', 'root']);
  });

  it('does not collect image embeds as pages', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '![[image.png]] [[linked.png]]', 'linked.png': '' });
    const notes = await collectNotes(app, 'root.md', '![[image.png]] [[linked.png]]', 1);
    const slugs = notes.map(n => n.slug);
    expect(slugs).toContain('linked');
    expect(slugs).not.toContain('image');
  });

  it('collects viewable direct links as pages', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[diagram.svg]]', 'diagram.svg': '<svg/>' });
    const notes = await collectNotes(app, 'root.md', '[[diagram.svg]]', 1);
    expect(notes.map(n => n.slug)).toContain('diagram');
  });

  it('populates notesByDepth metrics', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[a]] [[b]]', 'a.md': '[[c]]', 'b.md': '', 'c.md': '' });
    const orchestrator = new WikiExportOrchestrator(app, {} as never, { ...options, linkDepth: 2 });
    await orchestrator.collectNotes(createMockFile('root.md', '[[a]] [[b]]'));
    const metrics = orchestrator.getMetrics()!;
    expect(metrics.notesByDepth.get(0)).toBe(1);
    expect(metrics.notesByDepth.get(1)).toBe(2);
    expect(metrics.notesByDepth.get(2)).toBe(1);
  });
});

describe('Frontmatter', () => {
  beforeEach(installMockDocument);

  it('uses frontmatter.title as note title', async () => {
    const { app } = mockAppWithFiles({ 'note.md': '# Hello' }, { 'note.md': { title: 'My Custom Title' } });
    const notes = await collectNotes(app, 'note.md', '# Hello', 0);
    expect(notes[0].title).toBe('My Custom Title');
  });

  it('falls back to file.basename when there is no title', async () => {
    const { app } = mockAppWithFiles({ 'note.md': '# Hello' }, { 'note.md': { publish: true } });
    const notes = await collectNotes(app, 'note.md', '# Hello', 0);
    expect(notes[0].title).toBe('note');
  });

  it('attaches aliases, tags, author, license and note from frontmatter', async () => {
    const { app } = mockAppWithFiles(
      { 'note.md': '# Hello' },
      { 'note.md': { title: 'T', aliases: ['A', 'B'], tags: ['tag1'], author: 'Max', license: 'MIT', note: 'Export' } },
    );
    const notes = await collectNotes(app, 'note.md', '# Hello', 0);
    expect(notes[0].frontmatter.aliases).toEqual(['A', 'B']);
    expect(notes[0].frontmatter.tags).toEqual(['tag1']);
    expect(notes[0].frontmatter.author).toBe('Max');
    expect(notes[0].frontmatter.license).toBe('MIT');
    expect(notes[0].frontmatter.note).toBe('Export');
  });

  it('excludes a note with publish: false (root returns empty)', async () => {
    const { app } = mockAppWithFiles({ 'note.md': '# Hello' }, { 'note.md': { publish: false } });
    const notes = await collectNotes(app, 'note.md', '# Hello', 0);
    expect(notes).toHaveLength(0);
  });

  it('excludes a linked publish: false note and stops traversal there', async () => {
    const { app } = mockAppWithFiles(
      { 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '# should not appear' },
      { 'a.md': { publish: false } },
    );
    const notes = await collectNotes(app, 'root.md', '[[a]]', 2);
    expect(notes.map(n => n.slug)).toEqual(['root']);
  });

  it('includes notes with no frontmatter', async () => {
    const { app } = mockAppWithFiles({ 'note.md': '# Hello' });
    const notes = await collectNotes(app, 'note.md', '# Hello', 0);
    expect(notes[0].frontmatter).toEqual({});
  });
});

describe('Frontmatter depth override', () => {
  beforeEach(installMockDocument);

  it('uses export.scope.maxDepth when set', async () => {
    const { app } = mockAppWithFiles(
      { 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '' },
      { 'root.md': { export: { scope: { maxDepth: 2 } } } },
    );
    const notes = await collectNotes(app, 'root.md', '[[a]]', 1);
    expect(notes.map(n => n.slug)).toEqual(expect.arrayContaining(['root', 'a', 'b']));
  });

  it('falls back to the settings depth when no maxDepth is set', async () => {
    const { app } = mockAppWithFiles(
      { 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '' },
      { 'root.md': {} },
    );
    const notes = await collectNotes(app, 'root.md', '[[a]]', 1);
    expect(notes.map(n => n.slug)).toEqual(['root', 'a']);
  });

  it('maxDepth: 0 collects only the root', async () => {
    const { app } = mockAppWithFiles(
      { 'root.md': '[[a]]', 'a.md': '' },
      { 'root.md': { export: { scope: { maxDepth: 0 } } } },
    );
    const notes = await collectNotes(app, 'root.md', '[[a]]', 2);
    expect(notes.map(n => n.slug)).toEqual(['root']);
  });

  it('publish: false overrides the depth', async () => {
    const { app } = mockAppWithFiles(
      { 'root.md': '[[a]]' },
      { 'root.md': { publish: false, export: { scope: { maxDepth: 3 } } } },
    );
    const notes = await collectNotes(app, 'root.md', '[[a]]', 2);
    expect(notes).toHaveLength(0);
  });
});

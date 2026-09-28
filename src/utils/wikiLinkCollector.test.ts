import { describe, it, expect, beforeEach } from 'vitest';
import type { App } from 'obsidian';
import { WikiLinkCollector } from './wikiLinkCollector';
import { LinkResolver } from './linkResolver';
import { installMockDocument, mockAppWithFiles } from './test-utils';

function makeCollector(app: App): WikiLinkCollector {
  return new WikiLinkCollector(app, new LinkResolver());
}

describe('WikiLinkCollector', () => {
  beforeEach(installMockDocument);

  it('collects root only at depth 0', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '' });
    const result = await makeCollector(app).collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 0);
    expect(result).toHaveLength(1);
    expect(result[0].depth).toBe(0);
  });

  it('collects direct links at depth 1', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '' });
    const result = await makeCollector(app).collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 1);
    expect(result).toHaveLength(2);
  });

  it('collects indirect links at depth 2', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '' });
    const result = await makeCollector(app).collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 2);
    expect(result).toHaveLength(3);
  });

  it('handles cycles', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[root]]', 'b.md': '' });
    const result = await makeCollector(app).collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 3);
    expect(result).toHaveLength(2);
  });

  it('skips image embeds', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '![[img.png]] [[link.md]]', 'img.png': '', 'link.md': '' });
    const result = await makeCollector(app).collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 1);
    const slugs = result.map(r => r.file.basename);
    expect(slugs).toContain('root');
    expect(slugs).toContain('link');
    expect(slugs).not.toContain('img');
  });

  it('collects viewable direct links', async () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[diagram.svg]]', 'diagram.svg': '<svg/>' });
    const result = await makeCollector(app).collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 1);
    const slugs = result.map(r => r.file.basename);
    expect(slugs).toContain('diagram');
  });
});

describe('WikiLinkCollector.findFileByLink', () => {
  beforeEach(installMockDocument);

  it('finds markdown files by basename', () => {
    const { app } = mockAppWithFiles({ 'note.md': '' });
    const found = makeCollector(app).findFileByLink('note');
    expect(found).not.toBeNull();
    expect(found!.basename).toBe('note');
  });

  it('finds viewable files by name', () => {
    const { app } = mockAppWithFiles({ 'image.svg': '<svg/>' });
    const found = makeCollector(app).findFileByLink('image.svg');
    expect(found).not.toBeNull();
    expect(found!.basename).toBe('image');
  });

  it('resolves a path-based direct link', () => {
    const { app } = mockAppWithFiles({ 'root.md': '[[Projects/Foo/readme]]', 'Projects/Foo/readme.md': '' });
    const found = makeCollector(app).findFileByLink('Projects/Foo/readme');
    expect(found).not.toBeNull();
    expect(found!.path).toBe('Projects/Foo/readme.md');
  });

  it('resolves a basename fallback', () => {
    const { app } = mockAppWithFiles({ 'unique-note.md': '' });
    const found = makeCollector(app).findFileByLink('unique-note');
    expect(found).not.toBeNull();
    expect(found!.basename).toBe('unique-note');
  });
});

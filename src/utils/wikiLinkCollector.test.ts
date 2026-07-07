import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TFile } from 'obsidian';
import { WikiLinkCollector } from './wikiLinkCollector';
import { LinkResolver } from './linkResolver';

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

function mockAppWithFiles(entries: Record<string, string>) {
    const files: TFile[] = [];
    for (const [p, c] of Object.entries(entries)) {
        files.push(createFile(p, c));
    }
    const vault: Record<string, unknown> = {
        getFiles: () => files,
        cachedRead: async (f: TFile) =>
            (f as unknown as Record<string, unknown>).__content as string || '',
    };
    const app = { vault, workspace: {} };
    return app as unknown as import('obsidian').App;
}

describe('WikiLinkCollector', () => {
    beforeEach(() => {
        const body = { createDiv: vi.fn(() => ({ innerHTML: '', querySelectorAll: vi.fn(() => []), setAttribute: vi.fn() })) };
        Object.defineProperty(globalThis, 'document', {
            value: { body, createElement: vi.fn(() => ({ innerHTML: '' })) },
            writable: true,
            configurable: true,
        });
    });

    it('collects root only at depth 0', async () => {
        const app = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(createFile('root.md', '[[a]]'), 0);
        expect(result).toHaveLength(1);
        expect(result[0].depth).toBe(0);
    });

    it('collects direct links at depth 1', async () => {
        const app = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(createFile('root.md', '[[a]]'), 1);
        expect(result).toHaveLength(2);
    });

    it('collects indirect links at depth 2', async () => {
        const app = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(createFile('root.md', '[[a]]'), 2);
        expect(result).toHaveLength(3);
    });

    it('handles cycles', async () => {
        const app = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[root]]', 'b.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(createFile('root.md', '[[a]]'), 3);
        expect(result).toHaveLength(2);
    });

    it('skips image embeds', async () => {
        const app = mockAppWithFiles({ 'root.md': '![[img.png]] [[link.md]]', 'img.png': '', 'link.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(createFile('root.md', '![[img.png]] [[link.md]]'), 1);
        const slugs = result.map(r => r.file.basename);
        expect(slugs).toContain('root');
        expect(slugs).toContain('link');
        expect(slugs).not.toContain('img');
    });

    it('collects viewable direct links', async () => {
        const app = mockAppWithFiles({ 'root.md': '[[diagram.svg]]', 'diagram.svg': '<svg/>' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(createFile('root.md', '[[diagram.svg]]'), 1);
        const slugs = result.map(r => r.file.basename);
        expect(slugs).toContain('diagram');
    });

    it('finds markdown files by link', () => {
        const app = mockAppWithFiles({ 'note.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const found = collector.findFileByLink('note');
        expect(found).not.toBeNull();
        expect(found!.basename).toBe('note');
    });

    it('finds viewable files by link', () => {
        const app = mockAppWithFiles({ 'image.svg': '<svg/>' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const found = collector.findFileByLink('image.svg');
        expect(found).not.toBeNull();
        expect(found!.basename).toBe('image');
    });
});

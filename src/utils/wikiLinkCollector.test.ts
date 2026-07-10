import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TFile } from 'obsidian';
import { WikiLinkCollector } from './wikiLinkCollector';
import { LinkResolver } from './linkResolver';
import { createMockFile, mockAppWithFiles } from './test-utils';

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
        const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 0);
        expect(result).toHaveLength(1);
        expect(result[0].depth).toBe(0);
    });

    it('collects direct links at depth 1', async () => {
        const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 1);
        expect(result).toHaveLength(2);
    });

    it('collects indirect links at depth 2', async () => {
        const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[b]]', 'b.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 2);
        expect(result).toHaveLength(3);
    });

    it('handles cycles', async () => {
        const { app } = mockAppWithFiles({ 'root.md': '[[a]]', 'a.md': '[[root]]', 'b.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 3);
        expect(result).toHaveLength(2);
    });

    it('skips image embeds', async () => {
        const { app } = mockAppWithFiles({ 'root.md': '![[img.png]] [[link.md]]', 'img.png': '', 'link.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 1);
        const slugs = result.map(r => r.file.basename);
        expect(slugs).toContain('root');
        expect(slugs).toContain('link');
        expect(slugs).not.toContain('img');
    });

    it('collects viewable direct links', async () => {
        const { app } = mockAppWithFiles({ 'root.md': '[[diagram.svg]]', 'diagram.svg': '<svg/>' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const result = await collector.collectLinkedFiles(app.vault.getFiles().filter(f => f.path === 'root.md')[0], 1);
        const slugs = result.map(r => r.file.basename);
        expect(slugs).toContain('diagram');
    });

    it('finds markdown files by link', () => {
        const { app } = mockAppWithFiles({ 'note.md': '' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const found = collector.findFileByLink('note');
        expect(found).not.toBeNull();
        expect(found!.basename).toBe('note');
    });

    it('finds viewable files by link', () => {
        const { app } = mockAppWithFiles({ 'image.svg': '<svg/>' });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const found = collector.findFileByLink('image.svg');
        expect(found).not.toBeNull();
        expect(found!.basename).toBe('image');
    });
});

const { createMockFile: cf } = await import('./test-utils');

describe('Path-based slugs', () => {
    beforeEach(() => {
        const body = { createDiv: vi.fn(() => ({ innerHTML: '', querySelectorAll: vi.fn(() => []), setAttribute: vi.fn() })) };
        Object.defineProperty(globalThis, 'document', {
            value: { body, createElement: vi.fn(() => ({ innerHTML: '' })) },
            writable: true,
            configurable: true,
        });
    });

    it('generates unique slugs for same basename in different folders', () => {
        const resolver = new LinkResolver();
        const foo = cf('Projects/Foo/readme.md', '');
        const bar = cf('Projects/Bar/readme.md', '');
        expect(resolver.getFileSlug(foo)).toBe('projects-foo-readme');
        expect(resolver.getFileSlug(bar)).toBe('projects-bar-readme');
    });

    it('generates correct slug for viewable file with path', () => {
        const resolver = new LinkResolver();
        const svg = cf('assets/icons/settings.svg', '<svg/>');
        expect(resolver.getFileSlug(svg)).toBe('assets-icons-settings');
    });

    it('generates correct slug for excalidraw', () => {
        const resolver = new LinkResolver();
        const drawing = cf('drawing.excalidraw', '{}');
        expect(resolver.getFileSlug(drawing)).toBe('drawing');
    });

    it('generates correct slug for excalidraw.md', () => {
        const resolver = new LinkResolver();
        const board = cf('Boards/system.excalidraw.md', '');
        expect(resolver.getFileSlug(board)).toBe('boards-system');
    });

    it('generates unique slugs for viewable files in different folders', () => {
        const resolver = new LinkResolver();
        const a = cf('Diagrams/foo.svg', '<svg/>');
        const b = cf('Assets/foo.svg', '<svg/>');
        expect(resolver.getFileSlug(a)).toBe('diagrams-foo');
        expect(resolver.getFileSlug(b)).toBe('assets-foo');
    });

    it('resolves path-based direct link', () => {
        const { app } = mockAppWithFiles({
            'root.md': '[[Projects/Foo/readme]]',
            'Projects/Foo/readme.md': '',
        });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const found = collector.findFileByLink('Projects/Foo/readme');
        expect(found).not.toBeNull();
        expect(found!.path).toBe('Projects/Foo/readme.md');
    });

    it('resolves basename fallback still works', () => {
        const { app } = mockAppWithFiles({
            'unique-note.md': '',
        });
        const resolver = new LinkResolver();
        const collector = new WikiLinkCollector(app, resolver);
        const found = collector.findFileByLink('unique-note');
        expect(found).not.toBeNull();
        expect(found!.basename).toBe('unique-note');
    });
});

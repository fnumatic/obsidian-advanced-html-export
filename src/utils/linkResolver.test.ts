import { describe, it, expect } from 'vitest';
import { LinkResolver } from './linkResolver';
import { createMockFile } from './test-utils';

describe('LinkResolver', () => {
  describe('extractLinks', () => {
    it('extracts wiki links with their targets and aliases', () => {
      const resolver = new LinkResolver();
      const content = [
        '# Central Note',
        '- [[02-level1-topic-a]]',
        '- [[03-level1-topic-b|Custom Name]]',
      ].join('\n');

      const links = resolver.extractLinks(content);

      expect(links).toHaveLength(2);
      expect(links[0].target).toBe('02-level1-topic-a');
      expect(links[0].alias).toBe('02-level1-topic-a');
      expect(links[0].type).toBe('wiki');
      expect(links[1].target).toBe('03-level1-topic-b');
      expect(links[1].alias).toBe('Custom Name');
    });

    it('classifies image embeds separately and skips external links', () => {
      const resolver = new LinkResolver();
      const links = resolver.extractLinks(
        '![[diagram.png]] [[Note]] [site](https://example.com) [local](note.md)',
      );

      const byRawTarget = new Map(links.map((link) => [link.rawTarget, link.type]));
      expect(byRawTarget.get('diagram.png')).toBe('image-embed');
      expect(byRawTarget.get('Note')).toBe('wiki');
      expect(byRawTarget.get('note.md')).toBe('markdown');
      expect(byRawTarget.has('https://example.com')).toBe(false);
    });
  });

  describe('resolveLinks', () => {
    it('renders resolved links as anchors and preserves the alias', () => {
      const resolver = new LinkResolver();
      const { content } = resolver.resolveLinks('[[02-level1-topic-a|My Custom Alias]]');

      expect(content).toContain('data-page="02-level1-topic-a"');
      expect(content).toContain('My Custom Alias');
    });

    it('renders missing links as spans and preserves the alias', () => {
      const resolver = new LinkResolver();
      resolver.setPageSlugResolver(() => ({ slug: null, resolved: false }));
      const { content } = resolver.resolveLinks('[[NonExistentNote|My Label]]');

      expect(content).toContain('class="wiki-link-missing"');
      expect(content).toContain('data-missing-target="NonExistentNote"');
      expect(content).toContain('My Label');
      expect(content).not.toContain('data-page="');
    });

    it('does not touch image embeds', () => {
      const resolver = new LinkResolver();
      resolver.setPageSlugResolver(() => ({ slug: null, resolved: false }));
      const { content } = resolver.resolveLinks('![[MissingImage.png]]');
      expect(content).toBe('![[MissingImage.png]]');
    });

    it('escapes HTML in the missing link alias and target', () => {
      const resolver = new LinkResolver();
      resolver.setPageSlugResolver(() => ({ slug: null, resolved: false }));
      const { content } = resolver.resolveLinks('[[Bad <script>|Evil "Alias"]]');

      expect(content).toContain('&lt;script&gt;');
      expect(content).toContain('&quot;Alias&quot;');
      expect(content).not.toContain('<script>');
    });

    it('marks non-exported pages as missing', () => {
      const resolver = new LinkResolver();
      const allowed = new Set(['root']);
      resolver.setPageSlugResolver((rawTarget: string) => {
        const slug = resolver.slugify(rawTarget);
        return allowed.has(slug) ? { slug, resolved: true } : { slug: null, resolved: false };
      });

      const { content } = resolver.resolveLinks('[[root]] [[a]]');

      expect(content).toContain('data-page="root"');
      expect(content).toContain('wiki-link-missing');
      expect(content).toContain('data-missing-target="a"');
    });
  });

  describe('slugify', () => {
    it('keeps slugs stable and lowercases', () => {
      const resolver = new LinkResolver();
      expect(resolver.slugify('01-central-note')).toBe('01-central-note');
      expect(resolver.slugify('My Cool Note')).toBe('my-cool-note');
      expect(resolver.slugify('Test_Note-123')).toBe('test_note-123');
    });
  });

  describe('getFileSlug', () => {
    it('generates unique slugs for the same basename in different folders', () => {
      const resolver = new LinkResolver();
      expect(resolver.getFileSlug(createMockFile('Projects/Foo/readme.md', ''))).toBe('projects-foo-readme');
      expect(resolver.getFileSlug(createMockFile('Projects/Bar/readme.md', ''))).toBe('projects-bar-readme');
    });

    it('strips the extension for viewable files', () => {
      const resolver = new LinkResolver();
      expect(resolver.getFileSlug(createMockFile('assets/icons/settings.svg', '<svg/>'))).toBe('assets-icons-settings');
      expect(resolver.getFileSlug(createMockFile('drawing.excalidraw', '{}'))).toBe('drawing');
      expect(resolver.getFileSlug(createMockFile('Boards/system.excalidraw.md', ''))).toBe('boards-system');
    });
  });

  describe('findFileByLink', () => {
    it('finds a file by basename', () => {
      const resolver = new LinkResolver(new Map([['folder/note.md', 'folder/note.md']]));
      expect(resolver.findFileByLink('note')).toBe('folder/note.md');
    });

    it('finds a file by path', () => {
      const resolver = new LinkResolver(new Map([['folder/note.md', 'folder/note.md']]));
      expect(resolver.findFileByLink('folder/note')).toBe('folder/note.md');
    });
  });
});

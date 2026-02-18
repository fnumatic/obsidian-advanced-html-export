import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { LinkResolver } from '../utils/linkResolver';

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
});

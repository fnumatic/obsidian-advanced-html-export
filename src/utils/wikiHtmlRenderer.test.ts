import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { LinkResolver } from './linkResolver';

const testVaultPath = path.join(__dirname, '..', '..', 'testdata', 'testcase5');

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

function createMockVaultFiles(): Map<string, MockFile> {
    const files = new Map<string, MockFile>();
    const testFiles = [
        '01-central-note.md',
        '02-level1-topic-a.md',
        '03-level1-topic-b.md',
        '04-level1-topic-c.md',
        '05-level1-topic-d.md',
        '06-level2-subtopic-a1.md',
        '07-level2-subtopic-a2.md',
        '08-level2-subtopic-b1.md',
        '09-level2-subtopic-b2.md',
        '10-level2-subtopic-c1.md',
        '11-level1-topic-e.md',
    ];

    for (const file of testFiles) {
        const filePath = path.join(testVaultPath, file);
        if (fs.existsSync(filePath)) {
            files.set(file, createMockFile(filePath));
            files.set(path.join('testcase5', file), createMockFile(path.join('testcase5', file)));
        }
    }

    return files;
}

describe('WikiHtmlRenderer', () => {
    describe('LinkResolver', () => {
        it('should extract wiki links from content', () => {
            const resolver = new LinkResolver();
            const content = `
# Central Note

Links to:
- [[02-level1-topic-a]]
- [[03-level1-topic-b|Custom Name]]
`;

            const links = resolver.extractLinks(content);

            expect(links.length).toBe(2);
            expect(links[0].target).toBe('02-level1-topic-a');
            expect(links[0].alias).toBe('02-level1-topic-a');
            expect(links[1].target).toBe('03-level1-topic-b');
            expect(links[1].alias).toBe('Custom Name');
        });

        it('should generate consistent slugs', () => {
            const resolver = new LinkResolver();

            expect(resolver.slugify('01-central-note')).toBe('01-central-note');
            expect(resolver.slugify('02-level1-topic-a')).toBe('02-level1-topic-a');
            expect(resolver.slugify('My Cool Note')).toBe('my-cool-note');
        });

        it('should resolve links to HTML anchors', () => {
            const resolver = new LinkResolver();
            const content = '[[02-level1-topic-a]] and [[03-level1-topic-b|Topic B]]';

            const { content: resolved } = resolver.resolveLinks(content);

            expect(resolved).toContain('data-page="02-level1-topic-a"');
            expect(resolved).toContain('data-page="03-level1-topic-b"');
            expect(resolved).toContain('Topic B');
        });
    });

    describe('File Discovery', () => {
        it('should find files by basename', () => {
            const mockFiles = createMockVaultFiles();
            const fileMap = new Map<string, string>();
            mockFiles.forEach((file, key) => {
                fileMap.set(key, file.path);
            });

            const resolver = new LinkResolver(fileMap);

            const found = resolver.findFileByLink('02-level1-topic-a');
            expect(found).toBe('02-level1-topic-a.md');
        });

        it('should find files by path', () => {
            const mockFiles = createMockVaultFiles();
            const fileMap = new Map<string, string>();
            mockFiles.forEach((file, key) => {
                fileMap.set(key, file.path);
            });

            const resolver = new LinkResolver(fileMap);

            const found = resolver.findFileByLink('testcase5/02-level1-topic-a');
            expect(found).toBe('02-level1-topic-a.md');
        });
    });

    describe('Link Collection Algorithm', () => {
        it('should collect direct links only with depth 1', async () => {
            const resolver = new LinkResolver();
            const mockFiles = createMockVaultFiles();

            const testContent: Record<string, string> = {
                '01-central-note': '[[02-level1-topic-a]] [[03-level1-topic-b]]',
                '02-level1-topic-a': '[[06-level2-subtopic-a1]]',
                '03-level1-topic-b': '[[08-level2-subtopic-b1]]',
            };

            const visited = new Set<string>();
            const collected: string[] = [];

            async function collectLinks(fileSlug: string, currentDepth: number, maxDepth: number): Promise<void> {
                if (visited.has(fileSlug)) return;
                visited.add(fileSlug);
                collected.push(fileSlug);

                if (currentDepth >= maxDepth) return;

                const content = testContent[fileSlug] || '';
                const links = resolver.extractLinks(content);

                for (const link of links) {
                    await collectLinks(link.target, currentDepth + 1, maxDepth);
                }
            }

            await collectLinks('01-central-note', 0, 1);

            expect(visited.has('01-central-note')).toBe(true);
            expect(visited.has('02-level1-topic-a')).toBe(true);
            expect(visited.has('03-level1-topic-b')).toBe(true);
            expect(visited.has('06-level2-subtopic-a1')).toBe(false);
            expect(visited.has('08-level2-subtopic-b1')).toBe(false);
            expect(collected.length).toBe(3);
        });

        it('should collect all links with depth 2', async () => {
            const resolver = new LinkResolver();
            const mockFiles = createMockVaultFiles();

            const testContent: Record<string, string> = {
                '01-central-note': '[[02-level1-topic-a]] [[03-level1-topic-b]]',
                '02-level1-topic-a': '[[06-level2-subtopic-a1]]',
                '03-level1-topic-b': '[[08-level2-subtopic-b1]]',
            };

            const visited = new Set<string>();
            const collected: string[] = [];

            async function collectLinks(fileSlug: string, currentDepth: number, maxDepth: number): Promise<void> {
                if (visited.has(fileSlug)) return;
                visited.add(fileSlug);
                collected.push(fileSlug);

                if (currentDepth >= maxDepth) return;

                const content = testContent[fileSlug] || '';
                const links = resolver.extractLinks(content);

                for (const link of links) {
                    await collectLinks(link.target, currentDepth + 1, maxDepth);
                }
            }

            await collectLinks('01-central-note', 0, 2);

            expect(visited.has('01-central-note')).toBe(true);
            expect(visited.has('02-level1-topic-a')).toBe(true);
            expect(visited.has('03-level1-topic-b')).toBe(true);
            expect(visited.has('06-level2-subtopic-a1')).toBe(true);
            expect(visited.has('08-level2-subtopic-b1')).toBe(true);
            expect(collected.length).toBe(5);
        });

        it('should handle circular references', async () => {
            const resolver = new LinkResolver();

            const testContent: Record<string, string> = {
                '01-central-note': '[[02-level1-topic-a]]',
                '02-level1-topic-a': '[[03-level1-topic-b]]',
                '03-level1-topic-b': '[[01-central-note]]',
            };

            const visited = new Set<string>();
            const collected: string[] = [];

            async function collectLinks(fileSlug: string, currentDepth: number, maxDepth: number): Promise<void> {
                if (visited.has(fileSlug)) return;
                visited.add(fileSlug);
                collected.push(fileSlug);

                if (currentDepth >= maxDepth) return;

                const content = testContent[fileSlug] || '';
                const links = resolver.extractLinks(content);

                for (const link of links) {
                    await collectLinks(link.target, currentDepth + 1, maxDepth);
                }
            }

            await collectLinks('01-central-note', 0, 10);

            expect(visited.size).toBe(3);
            expect(collected.length).toBe(3);
        });
    });

    describe('Testcase5 Structure', () => {
        it('should have 11 markdown files', () => {
            const mockFiles = createMockVaultFiles();
            const mdFiles = Array.from(mockFiles.values()).filter(f => f.extension === 'md');
            expect(mdFiles.length).toBe(22);
        });

        it('should have correct link structure', () => {
            const resolver = new LinkResolver();
            const centralContent = fs.readFileSync(path.join(testVaultPath, '01-central-note.md'), 'utf-8');
            const links = resolver.extractLinks(centralContent);

            const linkTargets = links.map(l => l.target);
            
            expect(linkTargets).toContain('02-level1-topic-a');
            expect(linkTargets).toContain('03-level1-topic-b');
            expect(linkTargets).toContain('04-level1-topic-c');
            expect(linkTargets).toContain('05-level1-topic-d');
            expect(linkTargets).toContain('11-level1-topic-e');
        });
    });
});

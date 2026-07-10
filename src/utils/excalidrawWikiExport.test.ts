import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Component } from 'obsidian';
import { WikiExportOrchestrator, WikiExportOptions } from './wikiExportOrchestrator';
import { DetailedWikiRenderer } from './detailedRenderer';
import WikiHtmlRenderer from './wikiHtmlRenderer';
import { CancellationToken } from './cancellationToken';
import { PauseController } from './pauseController';
import { createMockFile as excCreateFile, mockAppWithFiles } from './test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SVG_EXAMPLE = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
const SVG_RECT = '<svg viewBox="0 0 200 200"><rect width="100" height="100"/></svg>';

function buildVault(entries: Record<string, string>) {
    return mockAppWithFiles(entries);
}

const defaultOptions: WikiExportOptions = {
    imageQuality: 'high',
    enableLazyLoading: false,
    enableImageDeduplication: false,
    linkDepth: 2,
    includeUnlinked: false,
    wikiTitle: 'Test Wiki',
    enableThemeToggle: false,
    enableInlineTOC: false,
    defaultTheme: 'light',
};

const token = new CancellationToken();
const pauseController = new PauseController();

// ---------------------------------------------------------------------------
// Module-level state for the MarkdownRenderer mock
// ---------------------------------------------------------------------------

const viewableContent = new Map<string, string>();

vi.mock('obsidian', async () => {
    const actual = await vi.importActual('obsidian');
    return {
        ...actual,
        MarkdownRenderer: {
            render: async (
                _app: unknown,
                markdown: string,
                el: HTMLElement,
                _sourcePath: string,
                _component: unknown,
            ) => {
                let html = markdown;
                html = html.replace(
                    /!\[\[([^\]]+\.(?:png|jpg|jpeg|gif|svg|webp|bmp|excalidraw))\]\]/g,
                    (_match: string, relPath: string) => {
                        const content = viewableContent.get(relPath) ?? '<viewable-mock>fallback</viewable-mock>';
                        return `<div class="viewable-embed" data-path="${relPath}">${content}</div>`;
                    },
                );
                el.innerHTML = html;
            },
        },
    };
});

// ---------------------------------------------------------------------------
// Minimal document mock (needed by renderPageWithProgress)
// ---------------------------------------------------------------------------

/** Extract attribute objects from <img> tags in HTML string */
function parseImgAttributes(html: string): Array<Record<string, string>> {
    const results: Array<Record<string, string>> = [];
    const imgRe = /<img\s+([^>]*)>/g;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(html)) !== null) {
        const parsed: Record<string, string> = {};
        const attrRe = /(\w[\w-]*)\s*=\s*["']([^"']*)["']/g;
        let a: RegExpExecArray | null;
        while ((a = attrRe.exec(im[1])) !== null) {
            parsed[a[1]] = a[2];
        }
        results.push(parsed);
    }
    return results;
}

/** Update or add an attribute on the first <img> in an HTML string */
function updateFirstImageAttribute(html: string, attrName: string, attrValue: string): string {
    const re = new RegExp(`(${attrName}\\s*=\\s*)["'][^"']*["']`);
    if (re.test(html)) {
        return html.replace(re, `$1"${attrValue}"`);
    }
    return html.replace(/(<img[^>]*)>/, `$1 ${attrName}="${attrValue}">`);
}

/** Create a mock element for querySelectorAll('img') results */
function createMockImageElement(
    attrs: Record<string, string>,
    updateHtml: (attrName: string, attrValue: string) => void,
): Record<string, unknown> {
    return {
        tagName: 'IMG',
        get src() { return attrs.src ?? ''; },
        setAttribute: (name: string, value: string) => {
            attrs[name] = value;
            updateHtml(name, value);
        },
    };
}

/** Build a mock element whose querySelectorAll understands img/a[data-page]/a.internal-link */
function mockEl() {
    let _html = '';
    const _imgAttrsList: Array<Record<string, string>> = [];

    const updateHtmlAttr = (attrName: string, attrValue: string) => {
        _html = updateFirstImageAttribute(_html, attrName, attrValue);
    };

    const _querySelectorAll = function (this: Record<string, unknown>, selector: string) {
        const isDataPage = selector === 'a[data-page]';
        const isInternalLink = selector === 'a.internal-link[data-href]';
        const isImg = selector === 'img';
        const results: Array<Record<string, unknown>> = [];

        if (isImg) {
            for (const attrs of _imgAttrsList) {
                results.push(createMockImageElement(attrs, updateHtmlAttr));
            }
            return results;
        }

        const tagRe = /<a\s+([^>]*)>/g;
        let m: RegExpExecArray | null;
        while ((m = tagRe.exec(_html)) !== null) {
            const attrs = m[1];
            const hasDataPage = /data-page\s*=\s*["']([^"']*)["']/.test(attrs);
            const hasDataHref = /data-href\s*=\s*["']([^"']*)["']/.test(attrs);
            const hasInternalLink = /\binternal-link\b/.test(attrs);
            if (isDataPage && hasDataPage) {
                const dataPage = attrs.match(/data-page\s*=\s*["']([^"']*)["']/)?.[1] || '';
                const href = attrs.match(/href\s*=\s*["']([^"']*)["']/)?.[1] || '';
                results.push({
                    tagName: 'A',
                    getAttribute: (name: string) => {
                        if (name === 'data-page') return dataPage;
                        if (name === 'href') return href;
                        return null;
                    },
                    setAttribute: vi.fn(),
                    removeAttribute: vi.fn(),
                    textContent: '',
                });
            } else if (isInternalLink && hasInternalLink && hasDataHref) {
                const dataHref = attrs.match(/data-href\s*=\s*["']([^"']*)["']/)?.[1] || '';
                const href = attrs.match(/href\s*=\s*["']([^"']*)["']/)?.[1] || '';
                const className = attrs.match(/class\s*=\s*["']([^"']*)["']/)?.[1] || '';
                const replaced = { replaced: false };
                results.push({
                    tagName: 'A',
                    className,
                    textContent: '',
                    getAttribute: (name: string) => {
                        if (name === 'data-href') return dataHref;
                        if (name === 'href') return href;
                        if (name === 'class') return className;
                        return null;
                    },
                    setAttribute: vi.fn((name: string, value: string) => {
                        if (name === 'data-page') {
                            replaced.replaced = true;
                        }
                    }),
                    removeAttribute: vi.fn(() => {}),
                    replaceWith: vi.fn((_el: unknown) => {
                        replaced.replaced = true;
                    }),
                    _replaced: replaced,
                });
            }
        }
        return results;
    };

    const self: Record<string, unknown> = {
        get innerHTML() { return _html; },
        set innerHTML(v: string) {
            _html = v;
            _imgAttrsList.length = 0;
            _imgAttrsList.push(...parseImgAttributes(v));
        },
        querySelectorAll: _querySelectorAll,
        querySelector(this: Record<string, unknown>, selector: string) {
            const results = _querySelectorAll.call(this, selector);
            return results.length > 0 ? results[0] : null;
        },
        getAttribute: vi.fn(() => null),
        setAttribute: vi.fn(),
        removeAttribute: vi.fn(),
        appendChild: vi.fn(),
        remove: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null,
    };
    return self;
}

beforeEach(() => {
    viewableContent.clear();

    const body = { createDiv: vi.fn(() => mockEl()) };
    Object.defineProperty(globalThis, 'document', {
        value: { body, createElement: vi.fn(() => mockEl()) },
        writable: true,
        configurable: true,
    });
});

// ===========================================================================
// A – Embed only  (![[diagram.excalidraw]])
// ===========================================================================

describe('A – Embed only', () => {
    it('does not collect the excalidraw file', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n![[diagram.excalidraw]]',
            'diagram.excalidraw': JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        const notes = await orch.collectNotes(byPath.get('central.md')!);

        expect(notes.length).toBe(1);
        expect(notes[0].slug).toBe('central');
    });
});

// ===========================================================================
// B – Direct link only  ([[diagram.excalidraw]])
// ===========================================================================

describe('B – Direct link only', () => {
    it('collects the excalidraw file as a wiki page', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram.excalidraw]]',
            'diagram.excalidraw': JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);

        const slugs = orch.getCollectedNotes().map((n) => n.slug);
        expect(slugs).toContain('central');
        expect(slugs).toContain('diagram');
        expect(slugs.length).toBe(2);
    });

    it('renders the excalidraw page via embed, not raw JSON', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram.excalidraw]]',
            'diagram.excalidraw': JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);
        orch.setSelectedNotes(orch.getCollectedNotes());

        const renderer = new DetailedWikiRenderer(app, new Component(), defaultOptions);
        const rendered = await orch.renderNotesWithProgress(
            renderer,
            token,
            pauseController,
            () => {},
        );

        const diagramPage = rendered.get('diagram');
        expect(diagramPage).toBeDefined();
        expect(diagramPage!).not.toContain('{"source"');
        expect(diagramPage!).toContain('viewable-embed');
        expect(diagramPage!).toContain('circle');
    });

    it('produces correct data-page and page-id in final wiki HTML', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram.excalidraw]]',
            'diagram.excalidraw': JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);
        orch.setSelectedNotes(orch.getCollectedNotes());

        const renderer = new DetailedWikiRenderer(app, new Component(), defaultOptions);
        const rendered = await orch.renderNotesWithProgress(
            renderer,
            token,
            pauseController,
            () => {},
        );

        const centralFile = byPath.get('central.md')!;
        const pageList = orch.getSelectedNotes().map((n) => ({
            slug: n.slug,
            title: n.title,
            path: n.path,
        }));
        const finalHtml = renderer.generateWikiHtmlWithRenderedPages(
            centralFile,
            rendered,
            pageList,
        );

        expect(finalHtml).toContain('id="page-diagram"');
        expect(finalHtml).toContain('data-page="diagram"');
        expect(finalHtml).not.toContain('data-page="diagramexcalidraw"');
        expect(finalHtml).not.toContain('diagramexcalidraw');
    });
});

// ===========================================================================
// C – Both embed and direct link
// ===========================================================================

describe('C – Both embed and direct link', () => {
    it('collects only one excalidraw page (no duplicate)', async () => {
        const { app, byPath } = buildVault({
            'central.md':
                '# Central\n\n![[diagram.excalidraw]]\n\n[[diagram.excalidraw]]',
            'diagram.excalidraw': JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);

        const slugs = orch.getCollectedNotes().map((n) => n.slug);
        expect(slugs.length).toBe(2);
        expect(slugs.filter((s) => s === 'diagram').length).toBe(1);
    });

    it('embed renders inline and direct link creates a separate page', async () => {
        const { app, byPath } = buildVault({
            'central.md':
                '# Central\n\n![[diagram.excalidraw]]\n\n[[diagram.excalidraw]]',
            'diagram.excalidraw': JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);
        orch.setSelectedNotes(orch.getCollectedNotes());

        const renderer = new DetailedWikiRenderer(app, new Component(), defaultOptions);
        const rendered = await orch.renderNotesWithProgress(
            renderer,
            token,
            pauseController,
            () => {},
        );

        // Central page contains the embed
        const centralPage = rendered.get('central')!;
        expect(centralPage).toContain('viewable-embed');

        // Diagram page is separate
        expect(rendered.has('diagram')).toBe(true);
    });
});

// ===========================================================================
// D – Excalidraw page rendering via detailed renderer
// ===========================================================================

describe('D – Detailed renderer direct', () => {
    it('renders an excalidraw file without exposing JSON', async () => {
        const { app, byPath } = buildVault({
            'drawing.excalidraw': JSON.stringify({ source: SVG_RECT, elements: [] }),
        });
        viewableContent.set('drawing.excalidraw', SVG_RECT);

        const renderer = new DetailedWikiRenderer(app, new Component(), defaultOptions);
        const html = await renderer.renderPageWithProgress(
            byPath.get('drawing.excalidraw')!,
            token,
            pauseController,
        );

        expect(html).not.toContain('{"source"');
        expect(html).not.toContain('elements');
        expect(html).not.toContain('excalidraw-error');
        expect(html).toContain('rect');
        expect(html).toContain('viewable-embed');
    });
});

// ===========================================================================
// E – Direct link without .excalidraw extension  ([[diagram]])
// ===========================================================================

describe('E – Link without extension', () => {
    it('resolves [[diagram]] to diagram.excalidraw when no diagram.md exists', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram]]',
            'diagram.excalidraw': JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);

        const slugs = orch.getCollectedNotes().map((n) => n.slug);
        expect(slugs).toContain('diagram');
    });
});

// ===========================================================================
// F – Extension collision: .md wins over .excalidraw
// ===========================================================================

describe('F – Extension collision', () => {
    it('resolves [[diagram]] to diagram.md when both exist', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram]]',
            'diagram.md': '# Diagram note',
            'diagram.excalidraw': JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);

        const slugs = orch.getCollectedNotes().map((n) => n.slug);
        expect(slugs).toContain('diagram');
        expect(slugs.length).toBe(2); // central + diagram.md only
        // diagram.excalidraw should NOT be collected separately
        const collectedMd = orch
            .getCollectedNotes()
            .filter((n) => n.file.extension === 'md');
        expect(collectedMd.length).toBe(2);
    });
});

// ===========================================================================
// G – Slug correctness
// ===========================================================================

describe('G – Slug correctness', () => {
    it('generates correct slug for [[diagram.excalidraw]]', async () => {
        const { LinkResolver } = await import('./linkResolver');
        const resolver = new LinkResolver();

        const links = resolver.extractLinks('[[diagram.excalidraw]]');
        expect(links[0].target).not.toBe('diagram'); // slugified version keeps the extension chars
        expect(links[0].rawTarget).toBe('diagram.excalidraw');
    });
});

// ===========================================================================
// H – Special characters in filename
// ===========================================================================

describe('H – Special characters', () => {
    it('handles excalidraw filenames with spaces', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[My Drawing.excalidraw]]',
            'My Drawing.excalidraw': JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        viewableContent.set('My Drawing.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);

        const slugs = orch.getCollectedNotes().map((n) => n.slug);
        expect(slugs).toContain('my-drawing');

        // The slug is my-drawing, not my-drawingexcalidraw
        expect(slugs).not.toContain('my-drawingexcalidraw');
    });

    it('resolved data-page uses basename slug not raw slug', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[My Drawing.excalidraw|My Drawing]]',
            'My Drawing.excalidraw': JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        viewableContent.set('My Drawing.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);
        orch.setSelectedNotes(orch.getCollectedNotes());

        const renderer = new DetailedWikiRenderer(app, new Component(), defaultOptions);
        const rendered = await orch.renderNotesWithProgress(
            renderer,
            token,
            pauseController,
            () => {},
        );

        const centralFile = byPath.get('central.md')!;
        const pageList = orch.getSelectedNotes().map((n) => ({
            slug: n.slug,
            title: n.title,
            path: n.path,
        }));
        const finalHtml = renderer.generateWikiHtmlWithRenderedPages(
            centralFile,
            rendered,
            pageList,
        );

        expect(finalHtml).toContain('data-page="my-drawing"');
        expect(finalHtml).not.toContain('data-page="my-drawingexcalidraw"');
        expect(finalHtml).not.toContain('data-page="my-drawing%');
    });
});

// ===========================================================================
// I – .excalidraw.md embed (no direct link)
// ===========================================================================

describe('I – .excalidraw.md embed only', () => {
    const excalidrawJson = JSON.stringify({ source: SVG_EXAMPLE, elements: [] });

    it('does not collect the .excalidraw.md file from embeds', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n![[diagram.excalidraw]]',
            'diagram.excalidraw.md': excalidrawJson,
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);

        expect(orch.getCollectedNotes().length).toBe(1);
        expect(orch.getCollectedNotes()[0].slug).toBe('central');
    });
});

// ===========================================================================
// J – .excalidraw.md direct link
// ===========================================================================

describe('J – .excalidraw.md direct link', () => {
    const excalidrawJson = JSON.stringify({ source: SVG_EXAMPLE, elements: [] });

    it('collects the .excalidraw.md file as a wiki page', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram.excalidraw]]',
            'diagram.excalidraw.md': excalidrawJson,
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);

        const slugs = orch.getCollectedNotes().map((n) => n.slug);
        expect(slugs).toContain('central');
        expect(slugs).toContain('diagram');
        expect(slugs.length).toBe(2);
    });

    it('renders the .excalidraw.md page via embed, not raw JSON', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram.excalidraw]]',
            'diagram.excalidraw.md': excalidrawJson,
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);
        orch.setSelectedNotes(orch.getCollectedNotes());

        const renderer = new DetailedWikiRenderer(app, new Component(), defaultOptions);
        const rendered = await orch.renderNotesWithProgress(
            renderer,
            token,
            pauseController,
            () => {},
        );

        // diagram page must not contain raw JSON
        const diagramPage = rendered.get('diagram');
        expect(diagramPage).toBeDefined();
        expect(diagramPage!).not.toContain('{"source"');
        expect(diagramPage!).not.toContain('elements');
        // must contain rendered excalidraw embed
        expect(diagramPage!).toContain('viewable-embed');
        expect(diagramPage!).toContain('circle');
    });

    it('produces correct slug for .excalidraw.md in final HTML', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram.excalidraw]]',
            'diagram.excalidraw.md': excalidrawJson,
        });
        viewableContent.set('diagram.excalidraw', SVG_EXAMPLE);

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);
        orch.setSelectedNotes(orch.getCollectedNotes());

        const renderer = new DetailedWikiRenderer(app, new Component(), defaultOptions);
        const rendered = await orch.renderNotesWithProgress(
            renderer,
            token,
            pauseController,
            () => {},
        );

        const centralFile = byPath.get('central.md')!;
        const pageList = orch.getSelectedNotes().map((n) => ({
            slug: n.slug,
            title: n.title,
            path: n.path,
        }));
        const finalHtml = renderer.generateWikiHtmlWithRenderedPages(
            centralFile,
            rendered,
            pageList,
        );

        // slug is 'diagram' not 'diagramexcalidraw'
        expect(finalHtml).toContain('data-page="diagram"');
        expect(finalHtml).toContain('id="page-diagram"');
        expect(finalHtml).not.toContain('data-page="diagramexcalidraw"');
        expect(finalHtml).not.toContain('id="page-diagramexcalidraw"');
    });
});

// ===========================================================================
// K – PNG as wiki page
// ===========================================================================

describe('K – PNG direct link', () => {
    it('collects a .png file as a wiki page', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram.png]]',
            'diagram.png': '<binary png data>',
        });
        viewableContent.set('diagram.png', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>');

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);

        const slugs = orch.getCollectedNotes().map((n) => n.slug);
        expect(slugs).toContain('central');
        expect(slugs).toContain('diagram');
        expect(slugs.length).toBe(2);
    });

    it('renders a .png page via embed, not raw content', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram.png]]',
            'diagram.png': '<binary png data>',
        });
        viewableContent.set('diagram.png', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>');

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);
        orch.setSelectedNotes(orch.getCollectedNotes());

        const renderer = new DetailedWikiRenderer(app, new Component(), defaultOptions);
        const rendered = await orch.renderNotesWithProgress(
            renderer,
            token,
            pauseController,
            () => {},
        );

        const page = rendered.get('diagram');
        expect(page).toBeDefined();
        expect(page!).toContain('viewable-embed');
        expect(page!).toContain('circle');
        expect(page!).not.toContain('binary png data');
    });

    it('produces correct slug for .png in final HTML', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram.png]]',
            'diagram.png': '<binary png data>',
        });
        viewableContent.set('diagram.png', '<svg>png-mock</svg>');

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);
        orch.setSelectedNotes(orch.getCollectedNotes());

        const renderer = new DetailedWikiRenderer(app, new Component(), defaultOptions);
        const rendered = await orch.renderNotesWithProgress(
            renderer,
            token,
            pauseController,
            () => {},
        );

        const centralFile = byPath.get('central.md')!;
        const pageList = orch.getSelectedNotes().map((n) => ({
            slug: n.slug,
            title: n.title,
            path: n.path,
        }));
        const finalHtml = renderer.generateWikiHtmlWithRenderedPages(
            centralFile,
            rendered,
            pageList,
        );

        expect(finalHtml).toContain('data-page="diagram"');
        expect(finalHtml).toContain('id="page-diagram"');
    });
});

// ===========================================================================
// L – SVG as wiki page
// ===========================================================================

describe('L – SVG direct link', () => {
    it('collects an .svg file as a wiki page', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[icon.svg]]',
            'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"><rect width="50" height="50"/></svg>',
        });
        viewableContent.set('icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="50" height="50"/></svg>');

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);

        const slugs = orch.getCollectedNotes().map((n) => n.slug);
        expect(slugs).toContain('central');
        expect(slugs).toContain('icon');
    });

    it('renders .svg page content', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[icon.svg]]',
            'icon.svg': '<svg><rect width="50" height="50"/></svg>',
        });
        viewableContent.set('icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="50" height="50"/></svg>');

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);
        orch.setSelectedNotes(orch.getCollectedNotes());

        const renderer = new DetailedWikiRenderer(app, new Component(), defaultOptions);
        const rendered = await orch.renderNotesWithProgress(
            renderer,
            token,
            pauseController,
            () => {},
        );

        const page = rendered.get('icon');
        expect(page).toBeDefined();
        expect(page!).toContain('viewable-embed');
        expect(page!).toContain('rect');
    });
});

// ===========================================================================
// M – MD wins over PNG collision
// ===========================================================================

describe('M – Extension collision: .md wins over .png', () => {
    it('resolves [[diagram]] to diagram.md when both diagram.md and diagram.png exist', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[diagram]]',
            'diagram.md': '# Diagram note',
            'diagram.png': '<binary png data>',
        });
        viewableContent.set('diagram.png', '<svg>png-mock</svg>');

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);

        const slugs = orch.getCollectedNotes().map((n) => n.slug);
        expect(slugs).toContain('diagram');
        expect(slugs.length).toBe(2); // central + diagram.md only
        const collectedMd = orch
            .getCollectedNotes()
            .filter((n) => n.file.extension === 'md');
        expect(collectedMd.length).toBe(2);
    });
});

// ===========================================================================
// N – Embed of image does not create a wiki page
// ===========================================================================

describe('N – Image embed only', () => {
    it('does not collect image files from embeds', async () => {
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n![[photo.png]]',
            'photo.png': '<binary>',
        });
        viewableContent.set('photo.png', '<svg>photo-mock</svg>');

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);

        expect(orch.getCollectedNotes().length).toBe(1);
        expect(orch.getCollectedNotes()[0].slug).toBe('central');
    });
});

// ===========================================================================
// O – Obsidian internal-link conversion
// ===========================================================================
//
// Tests for normalizeRenderedLinks: after MarkdownRenderer.render produces
// <a class="internal-link" data-href="..."> elements (from embedded content),
// they must be converted to SPA data-page links or wiki-link-missing spans.
// ===========================================================================

class ExposedRenderer extends WikiHtmlRenderer {
    constructor(app: App, component: Component, options: WikiExportOptions) {
        super(app, component, options);
    }

    callNormalizeRenderedLinks(el: HTMLElement): void {
        this.normalizeRenderedLinks(el);
    }
}

describe('O – Obsidian internal-link conversion', () => {
    it('converts internal-link to data-page when target is exported', async () => {
        const { app } = buildVault({
            'central.md': '# Central',
            'detail.md': '# Detail',
        });

        const renderer = new ExposedRenderer(app, new Component(), defaultOptions);

        // Track setAttribute calls
        const setAttrSpy = vi.fn();
        const removeAttrSpy = vi.fn();

        vi.spyOn(renderer, 'callNormalizeRenderedLinks').mockRestore?.();

        const el = document.createElement('div') as Record<string, unknown>;

        const queryResults = [{
            tagName: 'A',
            getAttribute: (name: string) => {
                if (name === 'data-href') return 'detail';
                if (name === 'href') return 'detail';
                if (name === 'class') return 'internal-link';
                return null;
            },
            setAttribute: setAttrSpy,
            removeAttribute: removeAttrSpy,
            textContent: 'Detail',
            href: 'detail',
        }];

        el.querySelectorAll = vi.fn((selector: string) => {
            if (selector === 'a.internal-link[data-href]') return queryResults;
            return [];
        });

        renderer.setResolvablePages([
            { slug: 'central', title: 'Central', path: 'central.md' },
            { slug: 'detail', title: 'Detail', path: 'detail.md' },
        ]);

        renderer.callNormalizeRenderedLinks(el as unknown as HTMLElement);

        expect(setAttrSpy).toHaveBeenCalledWith('data-page', 'detail');
        expect(removeAttrSpy).toHaveBeenCalledWith('data-href');
        expect(removeAttrSpy).toHaveBeenCalledWith('target');
        expect(queryResults[0].href).toBe('javascript:void(0)');
    });

    it('replaces internal-link with missing span when target not exported', async () => {
        const { app } = buildVault({
            'central.md': '# Central',
        });

        const renderer = new ExposedRenderer(app, new Component(), defaultOptions);

        const replaceWithSpy = vi.fn();

        const el = document.createElement('div') as Record<string, unknown>;

        const queryResults = [{
            tagName: 'A',
            getAttribute: (name: string) => {
                if (name === 'data-href') return 'secret';
                if (name === 'href') return 'secret';
                if (name === 'class') return 'internal-link';
                return null;
            },
            setAttribute: vi.fn(),
            removeAttribute: vi.fn(),
            textContent: 'Secret',
            href: 'secret',
            replaceWith: replaceWithSpy,
        }];

        el.querySelectorAll = vi.fn((selector: string) => {
            if (selector === 'a.internal-link[data-href]') return queryResults;
            return [];
        });

        renderer.setResolvablePages([
            { slug: 'central', title: 'Central', path: 'central.md' },
        ]);

        renderer.callNormalizeRenderedLinks(el as unknown as HTMLElement);

        expect(replaceWithSpy).toHaveBeenCalled();
        const spanArg = replaceWithSpy.mock.calls[0][0] as Record<string, unknown>;
        expect(spanArg.className).toBe('wiki-link-missing');
        // data-missing-target is set via setAttribute (mocked to no-op);
        // verify via spy if needed: setAttribute.mock.calls
    });

    it('strips subpath references from data-href heading refs', async () => {
        const { app } = buildVault({
            'central.md': '# Central',
            'detail.md': '# Detail',
        });

        const renderer = new ExposedRenderer(app, new Component(), defaultOptions);

        const setAttrSpy = vi.fn();

        const el = document.createElement('div') as Record<string, unknown>;

        const queryResults = [{
            tagName: 'A',
            getAttribute: (name: string) => {
                if (name === 'data-href') return 'detail#Heading';
                if (name === 'href') return 'detail#Heading';
                if (name === 'class') return 'internal-link';
                return null;
            },
            setAttribute: setAttrSpy,
            removeAttribute: vi.fn(),
            textContent: 'Detail Section',
            href: 'detail#Heading',
        }];

        el.querySelectorAll = vi.fn((selector: string) => {
            if (selector === 'a.internal-link[data-href]') return queryResults;
            return [];
        });

        renderer.setResolvablePages([
            { slug: 'central', title: 'Central', path: 'central.md' },
            { slug: 'detail', title: 'Detail', path: 'detail.md' },
        ]);

        renderer.callNormalizeRenderedLinks(el as unknown as HTMLElement);

        expect(setAttrSpy).toHaveBeenCalledWith('data-page', 'detail');
    });

    it('replaces internal-link with missing span when file not found', async () => {
        const { app } = buildVault({
            'central.md': '# Central',
        });

        const renderer = new ExposedRenderer(app, new Component(), defaultOptions);

        const replaceWithSpy = vi.fn();

        const el = document.createElement('div') as Record<string, unknown>;

        const queryResults = [{
            tagName: 'A',
            getAttribute: (name: string) => {
                if (name === 'data-href') return 'nonexistent';
                if (name === 'href') return 'nonexistent';
                if (name === 'class') return 'internal-link';
                return null;
            },
            setAttribute: vi.fn(),
            removeAttribute: vi.fn(),
            textContent: 'Missing',
            href: 'nonexistent',
            replaceWith: replaceWithSpy,
        }];

        el.querySelectorAll = vi.fn((selector: string) => {
            if (selector === 'a.internal-link[data-href]') return queryResults;
            return [];
        });

        renderer.setResolvablePages([
            { slug: 'central', title: 'Central', path: 'central.md' },
        ]);

        renderer.callNormalizeRenderedLinks(el as unknown as HTMLElement);

        expect(replaceWithSpy).toHaveBeenCalled();
        const spanArg = replaceWithSpy.mock.calls[0][0] as Record<string, unknown>;
        expect(spanArg.className).toBe('wiki-link-missing');
    });

    it('cleans up existing data-page links', async () => {
        const { app } = buildVault({
            'central.md': '# Central',
        });

        const renderer = new ExposedRenderer(app, new Component(), defaultOptions);

        const removeAttrSpy = vi.fn();

        const el = document.createElement('div') as Record<string, unknown>;

        const queryResults = [{
            tagName: 'A',
            getAttribute: (name: string) => null,
            setAttribute: vi.fn(),
            removeAttribute: removeAttrSpy,
            textContent: 'Central',
            href: 'javascript:void(0)',
        }];

        el.querySelectorAll = vi.fn((selector: string) => {
            if (selector === 'a[data-page]') return queryResults;
            return [];
        });

        renderer.callNormalizeRenderedLinks(el as unknown as HTMLElement);

        expect(removeAttrSpy).toHaveBeenCalledWith('target');
        expect(removeAttrSpy).toHaveBeenCalledWith('rel');
        expect(removeAttrSpy).toHaveBeenCalledWith('style');
    });
});

// ===========================================================================
// F – Direct link to excalidraw with blob image source (regression)
// ===========================================================================

describe('F – Direct link to excalidraw with blob image source', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    it('converts blob image to base64 on the excalidraw page (non-dedup)', async () => {
        const fetchMock = vi.mocked(globalThis.fetch as unknown as Mock);
        fetchMock.mockResolvedValue({
            blob: () =>
                Promise.resolve(new Blob([SVG_EXAMPLE], { type: 'image/svg+xml' })),
        });

        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[Deployment und Virtualisierung.excalidraw]]',
            'Deployment und Virtualisierung.excalidraw':
                JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        // Mock MarkdownRenderer to produce blob img (as Excalidraw plugin does)
        viewableContent.set(
            'Deployment und Virtualisierung.excalidraw',
            '<img src="blob:excalidraw-diagram">',
        );

        const orch = new WikiExportOrchestrator(app, new Component(), defaultOptions);
        await orch.collectNotes(byPath.get('central.md')!);
        orch.setSelectedNotes(orch.getCollectedNotes());

        const renderer = new DetailedWikiRenderer(app, new Component(), defaultOptions);
        const rendered = await orch.renderNotesWithProgress(
            renderer, token, pauseController, () => {},
        );

        const diagramPage = rendered.get('deployment-und-virtualisierung');
        expect(diagramPage).toBeDefined();
        expect(diagramPage!).not.toContain('blob:');
        expect(diagramPage!).toContain('<img');
        expect(diagramPage!).toContain('data:image/');
    });

    it('converts blob image with deduplication enabled', async () => {
        const fetchMock = vi.mocked(globalThis.fetch as unknown as Mock);
        fetchMock.mockResolvedValue({
            blob: () =>
                Promise.resolve(new Blob([SVG_EXAMPLE], { type: 'image/svg+xml' })),
        });

        const dedupOptions = { ...defaultOptions, enableImageDeduplication: true };
        const { app, byPath } = buildVault({
            'central.md': '# Central\n\n[[Deployment und Virtualisierung.excalidraw]]',
            'Deployment und Virtualisierung.excalidraw':
                JSON.stringify({ source: SVG_EXAMPLE, elements: [] }),
        });
        viewableContent.set(
            'Deployment und Virtualisierung.excalidraw',
            '<img src="blob:excalidraw-diagram">',
        );

        const orch = new WikiExportOrchestrator(app, new Component(), dedupOptions);
        await orch.collectNotes(byPath.get('central.md')!);
        orch.setSelectedNotes(orch.getCollectedNotes());

        const renderer = new DetailedWikiRenderer(app, new Component(), dedupOptions);
        const rendered = await orch.renderNotesWithProgress(
            renderer, token, pauseController, () => {},
        );

        const diagramPage = rendered.get('deployment-und-virtualisierung');
        expect(diagramPage).toBeDefined();
        expect(diagramPage!).not.toContain('blob:');
        expect(diagramPage!).toContain('data-hash=');
    });
});

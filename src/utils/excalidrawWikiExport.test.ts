import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App, Component } from 'obsidian';
import { WikiExportOrchestrator, WikiExportOptions } from './wikiExportOrchestrator';
import { DetailedWikiRenderer } from './detailedRenderer';
import WikiHtmlRenderer from './wikiHtmlRenderer';
import { CancellationToken } from './cancellationToken';
import { PauseController } from './pauseController';
import { mockAppWithFiles } from './test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SVG_EXAMPLE = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
const SVG_RECT = '<svg viewBox="0 0 200 200"><rect width="100" height="100"/></svg>';
const EXCALIDRAW_JSON = JSON.stringify({ source: SVG_EXAMPLE, elements: [] });
const PNG_VIEWABLE = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';

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
                    setAttribute: vi.fn((_name: string, _value: string) => {
                        if (_name === 'data-page') {
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

// ---------------------------------------------------------------------------
// Scan / render helpers
// ---------------------------------------------------------------------------

/** Collects notes from the given root and returns the orchestrator. */
async function collectFrom(
    entries: Record<string, string>,
    rootPath = 'central.md',
    options: WikiExportOptions = defaultOptions,
) {
    const { app, byPath } = buildVault(entries);
    const orch = new WikiExportOrchestrator(app, new Component(), options);
    await orch.collectNotes(byPath.get(rootPath)!);
    return { app, byPath, orch };
}

/** Collects and fully renders the export, returning the rendered pages and final HTML. */
async function renderFrom(
    entries: Record<string, string>,
    viewable: Record<string, string> = {},
    rootPath = 'central.md',
    options: WikiExportOptions = defaultOptions,
) {
    const { app, byPath } = buildVault(entries);
    for (const [key, value] of Object.entries(viewable)) {
        viewableContent.set(key, value);
    }

    const orch = new WikiExportOrchestrator(app, new Component(), options);
    await orch.collectNotes(byPath.get(rootPath)!);
    orch.setSelectedNotes(orch.getCollectedNotes());

    const renderer = new DetailedWikiRenderer(app, new Component(), options);
    const rendered = await orch.renderNotesWithProgress(renderer, token, pauseController, () => {});

    const pageList = orch.getSelectedNotes().map((n) => ({ slug: n.slug, title: n.title, path: n.path }));
    const finalHtml = renderer.generateWikiHtmlWithRenderedPages(byPath.get(rootPath)!, rendered, pageList);

    return { app, byPath, orch, renderer, rendered, finalHtml };
}

const slugsOf = (orch: WikiExportOrchestrator): string[] => orch.getCollectedNotes().map((n) => n.slug);

// ===========================================================================
// A/I/N – Embeds never create wiki pages
// ===========================================================================

interface EmbedOnlyCase {
    label: string;
    embed: string;
    files: Record<string, string>;
    viewable: Record<string, string>;
}

const embedOnlyCases: EmbedOnlyCase[] = [
    {
        label: 'excalidraw',
        embed: '![[diagram.excalidraw]]',
        files: { 'diagram.excalidraw': EXCALIDRAW_JSON },
        viewable: { 'diagram.excalidraw': SVG_EXAMPLE },
    },
    {
        label: '.excalidraw.md',
        embed: '![[diagram.excalidraw]]',
        files: { 'diagram.excalidraw.md': EXCALIDRAW_JSON },
        viewable: { 'diagram.excalidraw': SVG_EXAMPLE },
    },
    {
        label: 'image',
        embed: '![[photo.png]]',
        files: { 'photo.png': '<binary>' },
        viewable: { 'photo.png': '<svg>photo-mock</svg>' },
    },
];

describe('Embed only', () => {
    it.each(embedOnlyCases)('does not collect the $label file', async ({ embed, files, viewable }) => {
        const { orch } = await renderFrom(
            { 'central.md': `# Central\n\n${embed}`, ...files },
            viewable,
        );
        expect(slugsOf(orch)).toEqual(['central']);
    });
});

// ===========================================================================
// B/J/K/L – Direct links to viewable files
// ===========================================================================

interface DirectLinkCase {
    label: string;
    link: string;
    file: string;
    fileContent: string;
    viewable: string;
    slug: string;
    marker: string;
    rawMarker?: string;
    leftoverSlug?: string;
}

const directLinkCases: DirectLinkCase[] = [
    {
        label: 'Excalidraw',
        link: '[[diagram.excalidraw]]',
        file: 'diagram.excalidraw',
        fileContent: EXCALIDRAW_JSON,
        viewable: SVG_EXAMPLE,
        slug: 'diagram',
        marker: 'circle',
        rawMarker: '{"source"',
        leftoverSlug: 'diagramexcalidraw',
    },
    {
        label: '.excalidraw.md',
        link: '[[diagram.excalidraw]]',
        file: 'diagram.excalidraw.md',
        fileContent: EXCALIDRAW_JSON,
        viewable: SVG_EXAMPLE,
        slug: 'diagram',
        marker: 'circle',
        rawMarker: 'elements',
        leftoverSlug: 'diagramexcalidraw',
    },
    {
        label: 'PNG',
        link: '[[diagram.png]]',
        file: 'diagram.png',
        fileContent: '<binary png data>',
        viewable: PNG_VIEWABLE,
        slug: 'diagram',
        marker: 'circle',
        rawMarker: 'binary png data',
    },
    {
        label: 'SVG',
        link: '[[icon.svg]]',
        file: 'icon.svg',
        fileContent: '<svg><rect width="50" height="50"/></svg>',
        viewable: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="50" height="50"/></svg>',
        slug: 'icon',
        marker: 'rect',
    },
];

describe('Direct links to viewable files', () => {
    it.each(directLinkCases)(
        '$label: collects, renders and links the $slug page',
        async ({ link, file, fileContent, viewable, slug, marker, rawMarker, leftoverSlug }) => {
            const target = link.slice(2, -2);
            const { orch, rendered, finalHtml } = await renderFrom(
                { 'central.md': `# Central\n\n${link}`, [file]: fileContent },
                { [target]: viewable },
            );

            const slugs = slugsOf(orch);
            expect(slugs.sort()).toEqual(['central', slug].sort());

            const page = rendered.get(slug);
            expect(page).toBeDefined();
            expect(page!).toContain('viewable-embed');
            expect(page!).toContain(marker);
            if (rawMarker) {
                expect(page!).not.toContain(rawMarker);
            }

            expect(finalHtml).toContain(`data-page="${slug}"`);
            expect(finalHtml).toContain(`id="page-${slug}"`);
            if (leftoverSlug) {
                expect(finalHtml).not.toContain(leftoverSlug);
            }
        },
    );
});

// ===========================================================================
// C – Both embed and direct link
// ===========================================================================

describe('Both embed and direct link', () => {
    it('collects the diagram page only once', async () => {
        const { orch } = await collectFrom({
            'central.md': '# Central\n\n![[diagram.excalidraw]]\n\n[[diagram.excalidraw]]',
            'diagram.excalidraw': EXCALIDRAW_JSON,
        });

        const slugs = slugsOf(orch);
        expect(slugs).toHaveLength(2);
        expect(slugs.filter((s) => s === 'diagram')).toHaveLength(1);
    });

    it('renders the embed inline and the diagram as a separate page', async () => {
        const { rendered } = await renderFrom(
            {
                'central.md': '# Central\n\n![[diagram.excalidraw]]\n\n[[diagram.excalidraw]]',
                'diagram.excalidraw': EXCALIDRAW_JSON,
            },
            { 'diagram.excalidraw': SVG_EXAMPLE },
        );

        expect(rendered.get('central')).toContain('viewable-embed');
        expect(rendered.has('diagram')).toBe(true);
    });
});

// ===========================================================================
// D – Excalidraw page rendering via detailed renderer
// ===========================================================================

describe('Detailed renderer direct', () => {
    it('renders an excalidraw file without exposing JSON', async () => {
        const { app, byPath } = buildVault({ 'drawing.excalidraw': EXCALIDRAW_JSON });
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
// E – Link without extension
// ===========================================================================

describe('Link without extension', () => {
    it('resolves [[diagram]] to diagram.excalidraw when no diagram.md exists', async () => {
        const { orch } = await collectFrom({
            'central.md': '# Central\n\n[[diagram]]',
            'diagram.excalidraw': EXCALIDRAW_JSON,
        });
        expect(slugsOf(orch)).toContain('diagram');
    });
});

// ===========================================================================
// F/M – Extension collision: markdown wins
// ===========================================================================

interface CollisionCase {
    label: string;
    other: string;
    otherContent: string;
    viewable: Record<string, string>;
}

const collisionCases: CollisionCase[] = [
    {
        label: '.md over .excalidraw',
        other: 'diagram.excalidraw',
        otherContent: EXCALIDRAW_JSON,
        viewable: { 'diagram.excalidraw': SVG_EXAMPLE },
    },
    {
        label: '.md over .png',
        other: 'diagram.png',
        otherContent: '<binary png data>',
        viewable: { 'diagram.png': '<svg>png-mock</svg>' },
    },
];

describe('Extension collision', () => {
    it.each(collisionCases)('resolves [[diagram]] to diagram.md ($label)', async ({ other, otherContent, viewable }) => {
        const { orch } = await renderFrom(
            { 'central.md': '# Central\n\n[[diagram]]', 'diagram.md': '# Diagram note', [other]: otherContent },
            viewable,
        );
        const notes = orch.getCollectedNotes();
        expect(notes).toHaveLength(2);
        expect(notes.filter((n) => n.file.extension === 'md')).toHaveLength(2);
    });
});

// ===========================================================================
// G – Slug correctness
// ===========================================================================

describe('Slug correctness', () => {
    it('keeps the extension characters in the raw target', async () => {
        const { LinkResolver } = await import('./linkResolver');
        const links = new LinkResolver().extractLinks('[[diagram.excalidraw]]');
        expect(links[0].target).not.toBe('diagram');
        expect(links[0].rawTarget).toBe('diagram.excalidraw');
    });
});

// ===========================================================================
// H – Special characters in filename
// ===========================================================================

describe('Special characters in filenames', () => {
    it('handles excalidraw filenames with spaces', async () => {
        const { orch } = await collectFrom({
            'central.md': '# Central\n\n[[My Drawing.excalidraw]]',
            'My Drawing.excalidraw': EXCALIDRAW_JSON,
        });
        const slugs = slugsOf(orch);
        expect(slugs).toContain('my-drawing');
        expect(slugs).not.toContain('my-drawingexcalidraw');
    });

    it('uses the basename slug, not the raw slug, for data-page', async () => {
        const { finalHtml } = await renderFrom(
            {
                'central.md': '# Central\n\n[[My Drawing.excalidraw|My Drawing]]',
                'My Drawing.excalidraw': EXCALIDRAW_JSON,
            },
            { 'My Drawing.excalidraw': SVG_EXAMPLE },
        );
        expect(finalHtml).toContain('data-page="my-drawing"');
        expect(finalHtml).not.toContain('data-page="my-drawingexcalidraw"');
        expect(finalHtml).not.toContain('data-page="my-drawing%');
    });
});

// ===========================================================================
// O – Obsidian internal-link conversion
// ===========================================================================

class ExposedRenderer extends WikiHtmlRenderer {
    constructor(app: App, component: Component, options: WikiExportOptions) {
        super(app, component, options);
    }

    callNormalizeRenderedLinks(el: HTMLElement): void {
        this.normalizeRenderedLinks(el);
    }
}

interface LinkElementOptions {
    dataHref?: string;
    href?: string;
}

function normalizeLink(renderer: ExposedRenderer, options: LinkElementOptions) {
    const setAttrSpy = vi.fn();
    const removeAttrSpy = vi.fn();
    const replaceWithSpy = vi.fn();

    const anchor = {
        tagName: 'A',
        getAttribute: (name: string) => {
            if (name === 'data-href') return options.dataHref ?? null;
            if (name === 'href') return options.href ?? null;
            if (name === 'class') return 'internal-link';
            return null;
        },
        setAttribute: setAttrSpy,
        removeAttribute: removeAttrSpy,
        replaceWith: replaceWithSpy,
        textContent: 'Link',
    };

    const el = document.createElement('div') as unknown as Record<string, unknown>;
    el.querySelectorAll = vi.fn((selector: string) =>
        selector === 'a.internal-link[data-href]' ? [anchor] : [],
    );

    renderer.callNormalizeRenderedLinks(el as unknown as HTMLElement);
    return { setAttrSpy, removeAttrSpy, replaceWithSpy };
}

describe('Obsidian internal-link conversion', () => {
    it('converts internal-link to data-page when target is exported', async () => {
        const { app } = buildVault({ 'central.md': '# Central', 'detail.md': '# Detail' });
        const renderer = new ExposedRenderer(app, new Component(), defaultOptions);
        renderer.setResolvablePages([
            { slug: 'central', title: 'Central', path: 'central.md' },
            { slug: 'detail', title: 'Detail', path: 'detail.md' },
        ]);

        const { setAttrSpy, removeAttrSpy } = normalizeLink(renderer, { dataHref: 'detail', href: 'detail' });

        expect(setAttrSpy).toHaveBeenCalledWith('data-page', 'detail');
        expect(removeAttrSpy).toHaveBeenCalledWith('data-href');
        expect(removeAttrSpy).toHaveBeenCalledWith('target');
    });

    it('strips subpath references from heading refs', async () => {
        const { app } = buildVault({ 'central.md': '# Central', 'detail.md': '# Detail' });
        const renderer = new ExposedRenderer(app, new Component(), defaultOptions);
        renderer.setResolvablePages([
            { slug: 'central', title: 'Central', path: 'central.md' },
            { slug: 'detail', title: 'Detail', path: 'detail.md' },
        ]);

        const { setAttrSpy } = normalizeLink(renderer, { dataHref: 'detail#Heading', href: 'detail#Heading' });

        expect(setAttrSpy).toHaveBeenCalledWith('data-page', 'detail');
    });

    it('replaces internal-link with a missing span when the target is not exported', async () => {
        const { app } = buildVault({ 'central.md': '# Central' });
        const renderer = new ExposedRenderer(app, new Component(), defaultOptions);
        renderer.setResolvablePages([{ slug: 'central', title: 'Central', path: 'central.md' }]);

        const { replaceWithSpy } = normalizeLink(renderer, { dataHref: 'secret', href: 'secret' });

        expect(replaceWithSpy).toHaveBeenCalled();
        expect((replaceWithSpy.mock.calls[0][0] as Record<string, unknown>).className).toBe('wiki-link-missing');
    });

    it('replaces internal-link with a missing span when the file is not found', async () => {
        const { app } = buildVault({ 'central.md': '# Central' });
        const renderer = new ExposedRenderer(app, new Component(), defaultOptions);
        renderer.setResolvablePages([{ slug: 'central', title: 'Central', path: 'central.md' }]);

        const { replaceWithSpy } = normalizeLink(renderer, { dataHref: 'nonexistent', href: 'nonexistent' });

        expect(replaceWithSpy).toHaveBeenCalled();
        expect((replaceWithSpy.mock.calls[0][0] as Record<string, unknown>).className).toBe('wiki-link-missing');
    });

    it('cleans up existing data-page links', async () => {
        const { app } = buildVault({ 'central.md': '# Central' });
        const renderer = new ExposedRenderer(app, new Component(), defaultOptions);

        const removeAttrSpy = vi.fn();
        const anchor = {
            tagName: 'A',
            getAttribute: () => null,
            setAttribute: vi.fn(),
            removeAttribute: removeAttrSpy,
            textContent: 'Central',
        };
        const el = document.createElement('div') as unknown as Record<string, unknown>;
        el.querySelectorAll = vi.fn((selector: string) => (selector === 'a[data-page]' ? [anchor] : []));

        renderer.callNormalizeRenderedLinks(el as unknown as HTMLElement);

        expect(removeAttrSpy).toHaveBeenCalledWith('target');
        expect(removeAttrSpy).toHaveBeenCalledWith('rel');
        expect(removeAttrSpy).toHaveBeenCalledWith('style');
    });
});

// ===========================================================================
// Excalidraw page with a blob image source (regression)
// ===========================================================================

const BLOB_FILE = 'Deployment und Virtualisierung.excalidraw';
const BLOB_SLUG = 'deployment-und-virtualisierung';

describe('Excalidraw page with blob image source', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            blob: () => Promise.resolve(new Blob([SVG_EXAMPLE], { type: 'image/svg+xml' })),
        });
    });

    it.each([
        { label: 'without deduplication', dedup: false, expected: 'data:image/' },
        { label: 'with deduplication', dedup: true, expected: 'data-hash=' },
    ])('converts the blob image to an embedded source ($label)', async ({ dedup, expected }) => {
        const options = { ...defaultOptions, enableImageDeduplication: dedup };
        const { rendered } = await renderFrom(
            {
                'central.md': `# Central\n\n[[${BLOB_FILE}]]`,
                [BLOB_FILE]: EXCALIDRAW_JSON,
            },
            { [BLOB_FILE]: '<img src="blob:excalidraw-diagram">' },
            'central.md',
            options,
        );

        const page = rendered.get(BLOB_SLUG);
        expect(page).toBeDefined();
        expect(page!).not.toContain('blob:');
        expect(page!).toContain(expected);
    });
});

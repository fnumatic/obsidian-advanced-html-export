// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App, Component } from 'obsidian';
import { WikiExportOrchestrator, WikiExportOptions } from './wikiExportOrchestrator';
import { DetailedWikiRenderer } from './detailedRenderer';
import WikiHtmlRenderer from './wikiHtmlRenderer';
import { CancellationToken } from './cancellationToken';
import { PauseController } from './pauseController';
import { installObsidianDom, mockAppWithFiles } from './test-utils';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SVG_EXAMPLE = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
const SVG_RECT = '<svg viewBox="0 0 200 200"><rect width="100" height="100"/></svg>';
const EXCALIDRAW_JSON = JSON.stringify({ source: SVG_EXAMPLE, elements: [] });
const PNG_VIEWABLE = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';

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

/** Viewable file contents keyed by embed target, consumed by the renderer mock below. */
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
                el.innerHTML = markdown.replace(
                    /!\[\[([^\]]+\.(?:png|jpg|jpeg|gif|svg|webp|bmp|excalidraw))\]\]/g,
                    (_match: string, relPath: string) => {
                        const content = viewableContent.get(relPath) ?? '<viewable-mock>fallback</viewable-mock>';
                        return `<div class="viewable-embed" data-path="${relPath}">${content}</div>`;
                    },
                );
            },
        },
    };
});

// Image optimization needs a real canvas, which the DOM environment does not
// provide; the export scenarios here do not test optimization itself.
vi.mock('./imageOptimizer', () => ({
    ImageOptimizer: {
        optimizeImage: vi.fn(async (buffer: ArrayBuffer) => buffer),
        getMimeType: vi.fn(() => 'image/webp'),
        generateImageHash: vi.fn(async (buffer: ArrayBuffer) => `hash-${buffer.byteLength}`),
        isWebPSupported: vi.fn(() => true),
    },
}));

beforeEach(() => {
    viewableContent.clear();
    installObsidianDom();
    document.body.innerHTML = '';
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
    const { app, byPath } = mockAppWithFiles(entries);
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
    const { app, byPath } = mockAppWithFiles(entries);
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
// Embeds never create wiki pages
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
// Direct links to viewable files
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
// Both embed and direct link
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
// Detailed renderer direct
// ===========================================================================

describe('Detailed renderer direct', () => {
    it('renders an excalidraw file without exposing JSON', async () => {
        const { app, byPath } = mockAppWithFiles({ 'drawing.excalidraw': EXCALIDRAW_JSON });
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
// Link without extension
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
// Extension collision: markdown wins
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
// Slug correctness
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
// Special characters in filename
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
// Obsidian internal-link conversion
// ===========================================================================

class ExposedRenderer extends WikiHtmlRenderer {
    constructor(app: App, component: Component, options: WikiExportOptions) {
        super(app, component, options);
    }

    callNormalizeRenderedLinks(el: HTMLElement): void {
        this.normalizeRenderedLinks(el);
    }
}

function rendererWith(pages: Array<{ slug: string; path: string }>): ExposedRenderer {
    const { app } = mockAppWithFiles(
        Object.fromEntries([['central.md', '# Central'], ...pages.map((p) => [p.path, '# Page'])]),
    );
    const renderer = new ExposedRenderer(app, new Component(), defaultOptions);
    renderer.setResolvablePages(pages.map((p) => ({ slug: p.slug, title: p.slug, path: p.path })));
    return renderer;
}

describe('Obsidian internal-link conversion', () => {
    it('converts internal-link to data-page when target is exported', () => {
        const renderer = rendererWith([
            { slug: 'central', path: 'central.md' },
            { slug: 'detail', path: 'detail.md' },
        ]);
        const el = document.createElement('div');
        el.innerHTML = '<a class="internal-link" data-href="detail" href="detail" target="_blank">Detail</a>';

        renderer.callNormalizeRenderedLinks(el);

        const anchor = el.querySelector('a')!;
        expect(anchor.getAttribute('data-page')).toBe('detail');
        expect(anchor.getAttribute('href')).toBe('javascript:void(0)');
        expect(anchor.hasAttribute('data-href')).toBe(false);
        expect(anchor.hasAttribute('target')).toBe(false);
    });

    it('strips subpath references from heading refs', () => {
        const renderer = rendererWith([
            { slug: 'central', path: 'central.md' },
            { slug: 'detail', path: 'detail.md' },
        ]);
        const el = document.createElement('div');
        el.innerHTML = '<a class="internal-link" data-href="detail#Heading">Detail</a>';

        renderer.callNormalizeRenderedLinks(el);

        expect(el.querySelector('a')!.getAttribute('data-page')).toBe('detail');
    });

    it.each([
        { label: 'target not exported', dataHref: 'secret' },
        { label: 'file not found', dataHref: 'nonexistent' },
    ])('replaces internal-link with a missing span when $label', ({ dataHref }) => {
        const renderer = rendererWith([{ slug: 'central', path: 'central.md' }]);
        const el = document.createElement('div');
        el.innerHTML = `<a class="internal-link" data-href="${dataHref}">Link</a>`;

        renderer.callNormalizeRenderedLinks(el);

        const span = el.querySelector('.wiki-link-missing');
        expect(span).not.toBeNull();
        expect(span!.getAttribute('data-missing-target')).toBe(dataHref);
        expect(el.querySelector('a')).toBeNull();
    });

    it('cleans up existing data-page links', () => {
        const el = document.createElement('div');
        el.innerHTML = '<a data-page="central" target="_blank" rel="noopener" style="color:red">Central</a>';

        rendererWith([{ slug: 'central', path: 'central.md' }]).callNormalizeRenderedLinks(el);

        const anchor = el.querySelector('a')!;
        expect(anchor.hasAttribute('target')).toBe(false);
        expect(anchor.hasAttribute('rel')).toBe(false);
        expect(anchor.hasAttribute('style')).toBe(false);
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

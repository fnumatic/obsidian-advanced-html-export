import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App, Component, TFile } from 'obsidian';
import { WikiExportOrchestrator, WikiExportOptions } from './wikiExportOrchestrator';
import { DetailedWikiRenderer } from './detailedRenderer';
import { CancellationToken } from './cancellationToken';
import { PauseController } from './pauseController';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SVG_EXAMPLE = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
const SVG_RECT = '<svg viewBox="0 0 200 200"><rect width="100" height="100"/></svg>';

function createFile(path: string, content: string): TFile {
    const name = path.split('/').pop() || path;
    const dot = name.lastIndexOf('.');
    const ext = dot >= 0 ? name.slice(dot + 1) : '';
    const basename = dot >= 0 ? name.slice(0, dot) : name;
    const file = new TFile();
    file.path = path;
    file.basename = basename;
    file.extension = ext;
    file.name = name;
    file.stat = { mtime: Date.now(), ctime: Date.now(), size: 0 };
    (file as unknown as Record<string, unknown>).__content = content;
    return file as unknown as TFile;
}

interface FakeVault {
    app: App;
    files: TFile[];
    byPath: Map<string, TFile>;
}

function buildVault(entries: Record<string, string>): FakeVault {
    const files: TFile[] = [];
    const byPath = new Map<string, TFile>();

    for (const [path, content] of Object.entries(entries)) {
        const f = createFile(path, content);
        files.push(f);
        byPath.set(path, f);
    }

    const vault: Record<string, unknown> = {
        getFiles: () => files,
        cachedRead: async (file: TFile) =>
            (file as unknown as Record<string, unknown>).__content as string || '',
    };

    const app = new App() as unknown as Record<string, unknown>;
    app.vault = vault;
    app.workspace = {};
    app.metadataCache = { getFileCache: () => null };
    return { app: app as unknown as App, files, byPath };
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

function mockEl() {
    let _html = '';
    return {
        get innerHTML() {
            return _html;
        },
        set innerHTML(v: string) {
            _html = v;
        },
        querySelectorAll: vi.fn(() => []),
        setAttribute: vi.fn(),
        removeAttribute: vi.fn(),
        appendChild: vi.fn(),
        remove: vi.fn(),
        insertBefore: vi.fn(),
        firstChild: null,
    };
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

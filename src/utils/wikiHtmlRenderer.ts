import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import HtmlRenderer from './htmlRenderer';
import { LinkResolver } from './linkResolver';

export interface WikiRenderOptions {
    imageQuality: 'high' | 'medium' | 'low';
    enableLazyLoading: boolean;
    enableImageDeduplication: boolean;
    linkDepth: number;
    includeUnlinked: boolean;
    wikiTitle?: string;
}

export interface PageInfo {
    slug: string;
    title: string;
    path: string;
}

export default class WikiHtmlRenderer extends HtmlRenderer {
    private linkResolver: LinkResolver;
    private pageList: PageInfo[] = [];
    private vaultFiles: Map<string, TFile> = new Map();

    constructor(app: App, component: Component, options: WikiRenderOptions) {
        super(app, component, options);
        this.linkResolver = new LinkResolver();
        this.initializeVaultFiles();
    }

    private initializeVaultFiles(): void {
        const vault = this.app.vault;
        const files = vault.getFiles();

        for (const file of files) {
            if (file.extension === 'md') {
                this.vaultFiles.set(file.path, file);
                this.vaultFiles.set(file.basename, file);
            }
        }

        const fileMap = new Map<string, string>();
        for (const [key, file] of this.vaultFiles) {
            fileMap.set(key, file.path);
        }
        this.linkResolver.setVaultFiles(fileMap);
    }

    async renderWiki(centralFile: TFile, onProgress?: (current: number, total: number) => void): Promise<string> {
        const options = this.settings as WikiRenderOptions;

        const collectedFiles = await this.collectLinkedNotes(centralFile, 0, options.linkDepth, new Set<string>());

        this.pageList = collectedFiles.map((file) => ({
            slug: this.linkResolver.slugify(file.basename),
            title: file.basename,
            path: file.path
        }));

        const progressCallback = onProgress || ((current: number, total: number) => {
            console.log(`Rendering page ${current}/${total}`);
        });

        const renderedPages: Map<string, string> = new Map();

        let currentIndex = 0;
        const totalPages = collectedFiles.length;

        for (const file of collectedFiles) {
            currentIndex++;
            progressCallback(currentIndex, totalPages);

            const slug = this.linkResolver.slugify(file.basename);
            const content = await this.app.vault.cachedRead(file);
            const html = await this.renderPage(content);
            renderedPages.set(slug, html);
        }

        return this.generateWikiHtml(centralFile, renderedPages);
    }

    private async collectLinkedNotes(file: TFile, currentDepth: number, maxDepth: number, visited: Set<string>): Promise<TFile[]> {
        const result: TFile[] = [];

        if (visited.has(file.path)) {
            return result;
        }

        if (currentDepth >= maxDepth) {
            return result;
        }

        visited.add(file.path);
        result.push(file);

        const content = await this.app.vault.cachedRead(file);
        const links = this.linkResolver.extractLinks(content);

        for (const link of links) {
            const targetFile = this.findFileByLink(link.target);
            if (targetFile && !visited.has(targetFile.path)) {
                visited.add(targetFile.path);
                result.push(targetFile);

                if (currentDepth + 1 < maxDepth) {
                    const subLinks = this.linkResolver.extractLinks(await this.app.vault.cachedRead(targetFile));
                    for (const subLink of subLinks) {
                        const subFile = this.findFileByLink(subLink.target);
                        if (subFile && !visited.has(subFile.path)) {
                            visited.add(subFile.path);
                            result.push(subFile);
                        }
                    }
                }
            }
        }

        return result;
    }

    private findFileByLink(linkTarget: string): TFile | null {
        const cleanTarget = linkTarget.replace(/\.md$/i, '');
        const targetSlug = this.linkResolver.slugify(cleanTarget);

        for (const [, file] of this.vaultFiles) {
            const fileNameSlug = this.linkResolver.slugify(file.basename.replace(/\.md$/i, ''));

            if (fileNameSlug === targetSlug) {
                return file;
            }
        }

        return null;
    }

    async renderPage(markdownContent: string): Promise<string> {
        const { content: resolvedContent } = this.linkResolver.resolveLinks(markdownContent);

        const el = document.body.createDiv();
        await MarkdownRenderer.render(this.app, resolvedContent, el, '.', this.component);

        el.querySelectorAll('.copy-code-button').forEach((e) => {
            e.remove();
        });

        const imgElements = el.querySelectorAll('img');
        const imagePromises = Array.from(imgElements).map(async (img) => {
            const src = img.src;
            if (src) {
                if (this.settings.enableImageDeduplication) {
                    const hash = await this.convertImageToHash(src);
                    img.setAttribute('data-hash', hash);
                    img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
                    if (this.settings.enableLazyLoading) {
                        img.setAttribute('loading', 'lazy');
                    }
                } else {
                    const base64 = await this.convertImageToBase64String(src);
                    img.setAttribute('src', base64);
                    if (this.settings.enableLazyLoading) {
                        img.setAttribute('loading', 'lazy');
                    }
                }
            }
        });

        await Promise.all(imagePromises);

        el.querySelectorAll('a[data-page]').forEach((a) => {
            a.removeAttribute('target');
            a.removeAttribute('rel');
            a.removeAttribute('style');
        });

        return el.innerHTML;
    }

    private generateWikiHtml(centralFile: TFile, renderedPages: Map<string, string>): string {
        const options = this.settings as WikiRenderOptions;
        const wikiTitle = options.wikiTitle || centralFile.basename;

        const pagesJson = JSON.stringify(this.pageList);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${wikiTitle}</title>
    <style>
        ${this.getWikiStyles()}
    </style>
</head>
<body>
    ${this.getWikiHtmlStructure(renderedPages)}
    <script>
        ${this.getWikiJavaScript(pagesJson)}
    </script>
</body>
</html>`;
    }

    private getWikiStyles(): string {
        return `
            .wiki-container { display: flex; min-height: 100vh; overflow-x: hidden; }
            .wiki-sidebar { width: 280px; background: #f8fafc; border-right: 1px solid #e2e8f0; padding: 1rem; position: sticky; top: 0; height: 100vh; overflow-y: auto; flex-shrink: 0; transition: transform 0.2s ease, width 0.2s ease; transform: translateX(0); }
            .wiki-sidebar.collapsed { width: 0; padding: 1rem 0; transform: translateX(-100%); }
            .wiki-sidebar-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; min-width: 0; }
            .wiki-search { position: relative; flex: 1; min-width: 0; }
            .wiki-search input { width: 100%; padding: 0.5rem 0.75rem 0.5rem 2.75rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.875rem; outline: none; background: #fff; transition: all 0.15s ease; box-sizing: border-box; }
            .wiki-search input::placeholder { color: #94a3b8; }
            .wiki-search input:focus { border-color: #0ea5e9; box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1); }
            .wiki-content { flex: 1; padding: 1.5rem 2rem; max-width: 800px; margin: 0 auto; }
            .wiki-page { display: none; }
            .wiki-page.active { display: block; }
            #wiki-sidebar-toggle:hover:not(:disabled),
            #wiki-back:hover:not(:disabled),
            #wiki-forward:hover:not(:disabled) { background: #f1f5f9; color: #334155; }
            #wiki-sidebar-toggle:focus-visible,
            #wiki-back:focus-visible,
            #wiki-forward:focus-visible { outline: 2px solid #0ea5e9; outline-offset: 2px; }
            #wiki-sidebar-toggle:disabled,
            #wiki-back:disabled,
            #wiki-forward:disabled { opacity: 0.4; cursor: default; }
            .wiki-breadcrumb { font-size: 0.875rem; color: #64748b; display: flex; align-items: center; gap: 0.5rem; }
            .wiki-breadcrumb a { color: #475569; text-decoration: none; cursor: pointer; font-weight: 500; transition: color 0.15s ease; }
            .wiki-breadcrumb a:hover { color: #0ea5e9; }
            .wiki-toc h3 { font-size: 0.75rem; font-weight: 600; margin-bottom: 0.5rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
            .wiki-toc ul { list-style: none; padding: 0; margin: 0; }
            .wiki-toc li { margin: 0.125rem 0; }
            .wiki-toc a { color: #475569; text-decoration: none; padding: 0.375rem 0.625rem; border-radius: 6px; display: block; font-size: 0.875rem; transition: all 0.15s ease; }
            .wiki-toc a:hover { background: #f1f5f9; color: #0ea5e9; }
            .wiki-toc a.active { background: #f0f9ff; color: #0284c7; font-weight: 500; }
            @media (max-width: 768px) {
                .wiki-container { display: block; }
                .wiki-sidebar { width: 100%; position: static; height: auto; border-right: none; border-bottom: 1px solid #e2e8f0; transform: none !important; overflow: hidden; box-sizing: border-box; background: #f8fafc; }
                .wiki-sidebar.collapsed { display: none; width: 0; padding: 0; }
                .wiki-sidebar-header { flex-wrap: nowrap; }
                .wiki-content { padding: 1rem; max-width: 100%; box-sizing: border-box; }
            }
            ${this.getMarkdownStyles()}
        `;
    }

    private getMarkdownStyles(): string {
        return `
            .markdown-body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #1e293b; }
            .markdown-body h1 { font-size: 1.875rem; font-weight: 600; padding-bottom: 0.5rem; border-bottom: 1px solid #e2e8f0; margin-top: 2rem; margin-bottom: 1rem; color: #0f172a; letter-spacing: -0.025em; }
            .markdown-body h2 { font-size: 1.5rem; font-weight: 600; padding-bottom: 0.5rem; border-bottom: 1px solid #e2e8f0; margin-top: 2rem; margin-bottom: 1rem; color: #1e293b; letter-spacing: -0.025em; }
            .markdown-body h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #334155; }
            .markdown-body p { margin-top: 0; margin-bottom: 1rem; color: #475569; }
            .markdown-body ul { margin-top: 0; margin-bottom: 1rem; padding-left: 1.5rem; }
            .markdown-body li { margin-bottom: 0.25rem; color: #475569; }
            .wiki-content a { color: #0ea5e9; text-decoration: none; cursor: pointer; font-weight: 500; transition: color 0.15s ease; }
            .wiki-content a:hover { color: #0284c7; text-decoration: underline; }
            .wiki-content a:visited { color: #8b5cf6; }
        `;
    }

    private getWikiHtmlStructure(renderedPages: Map<string, string>): string {
        const centralSlug = this.pageList.length > 0 ? this.pageList[0].slug : 'central';

        return `
    <div class="wiki-container">
        <aside class="wiki-sidebar" id="wiki-sidebar">
            <div class="wiki-sidebar-header">
                <div class="wiki-search" style="position: relative; flex: 1;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); pointer-events: none;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input type="text" id="wiki-search-input" placeholder="Search notes..." style="width: 100%; padding: 0.5rem 0.75rem 0.5rem 2.75rem; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.875rem; outline: none; background: #fff; transition: all 0.15s ease; box-sizing: border-box;">
                </div>
            </div>
            <nav class="wiki-toc">
                <h3>Contents</h3>
                <ul id="wiki-page-list"></ul>
            </nav>
        </aside>

        <main class="wiki-content" id="wiki-content">
            <div class="wiki-header" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
                <button id="wiki-sidebar-toggle" title="Toggle sidebar" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: transparent; border: 1px solid transparent; cursor: pointer; border-radius: 6px; color: #64748b; transition: all 0.15s ease;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
                </button>
                <div class="wiki-nav" style="display: flex; align-items: center; gap: 0.25rem; border-left: 1px solid #e2e8f0; padding-left: 1rem; margin-left: 0.25rem;">
                    <button id="wiki-back" disabled style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: transparent; border: 1px solid transparent; cursor: pointer; border-radius: 6px; color: #64748b; transition: all 0.15s ease;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                    </button>
                    <button id="wiki-forward" disabled style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: transparent; border: 1px solid transparent; cursor: pointer; border-radius: 6px; color: #64748b; transition: all 0.15s ease;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </button>
                </div>
                <nav class="wiki-breadcrumb" id="wiki-breadcrumb" style="font-size: 0.875rem; color: #64748b; display: flex; align-items: center; gap: 0.5rem;">
                    <a href="javascript:void(0)" data-page="${centralSlug}" style="cursor: pointer; color: #475569; text-decoration: none; font-weight: 500;">Home</a>
                </nav>
            </div>

            ${this.generatePageSections(renderedPages)}
        </main>
    </div>`;
    }

    private generatePageSections(renderedPages: Map<string, string>): string {
        return this.pageList.map(page => {
            const html = renderedPages.get(page.slug) || '';
            const isActive = page.slug === this.pageList[0].slug ? ' active' : '';
            return `<section id="page-${page.slug}" class="wiki-page${isActive}" data-title="${page.title}">${html}</section>`;
        }).join('\n');
    }

    private getWikiJavaScript(pagesJson: string): string {
        return `
            const wikiPages = ${pagesJson};
            const wikiState = {
                currentPage: '${this.pageList.length > 0 ? this.pageList[0].slug : 'central'}',
                history: ['${this.pageList.length > 0 ? this.pageList[0].slug : 'central'}'],
                forwardStack: []
            };

            function initWiki() {
                updatePageList();
                setupNavigation();
                setupSearch();
                setupPopstate();
                ${this.settings.enableImageDeduplication ? this.getImageRestorationScript() : ''}
            }

            function updatePageList() {
                const list = document.getElementById('wiki-page-list');
                list.innerHTML = '';
                wikiPages.forEach(function(page) {
                    const li = document.createElement('li');
                    const a = document.createElement('a');
                    a.href = 'javascript:void(0)';
                    a.setAttribute('data-page', page.slug);
                    a.style.cursor = 'pointer';
                    a.textContent = page.title;
                    li.appendChild(a);
                    list.appendChild(li);
                });
            }

            function setupNavigation() {
                const sidebar = document.getElementById('wiki-sidebar');
                const content = document.getElementById('wiki-content');
                const toggle = document.getElementById('wiki-sidebar-toggle');

                function toggleSidebar() {
                    sidebar.classList.toggle('collapsed');
                    content.classList.toggle('expanded');
                    localStorage.setItem('wikiSidebarCollapsed', sidebar.classList.contains('collapsed'));
                }

                toggle.addEventListener('click', toggleSidebar);

                const savedCollapsed = localStorage.getItem('wikiSidebarCollapsed') === 'true';
                if (savedCollapsed) {
                    sidebar.classList.add('collapsed');
                    content.classList.add('expanded');
                }

                document.getElementById('wiki-back').addEventListener('click', wikiBack);
                document.getElementById('wiki-forward').addEventListener('click', wikiForward);

                document.getElementById('wiki-page-list').addEventListener('click', function(e) {
                    if (e.target.tagName === 'A') {
                        e.preventDefault();
                        const page = e.target.getAttribute('data-page');
                        if (page) {
                            showPage(page);
                        }
                    }
                });

                document.addEventListener('click', function(e) {
                    const link = e.target.closest('a[data-page]');
                    if (link) {
                        e.preventDefault();
                        const page = link.getAttribute('data-page');
                        if (page) {
                            showPage(page);
                        }
                    }
                });
            }

            function setupSearch() {
                document.getElementById('wiki-search-input').addEventListener('input', function(e) {
                    const query = e.target.value.toLowerCase();
                    const list = document.getElementById('wiki-page-list');
                    list.querySelectorAll('li').forEach(function(li) {
                        const match = li.textContent.toLowerCase().includes(query);
                        li.style.display = match ? 'block' : 'none';
                    });
                });
            }

            function setupPopstate() {
                window.addEventListener('popstate', function(e) {
                    if (e.state && e.state.slug) {
                        showPage(e.state.slug);
                    }
                });
            }

            function showPage(slug, addToHistory = true) {
                const target = document.getElementById('page-' + slug);
                if (!target) return;

                document.querySelectorAll('.wiki-page').forEach(function(p) {
                    p.classList.remove('active');
                });
                target.classList.add('active');

                const previousSlug = wikiState.currentPage;
                wikiState.currentPage = slug;

                if (addToHistory && previousSlug !== slug) {
                    wikiState.history.push(slug);
                    wikiState.forwardStack = [];
                }

                history.replaceState({slug: slug}, '', '#' + slug);
                updateBreadcrumb(slug);
                updateNavButtons();
                updateActiveSidebar(slug);
            }

            function wikiBack() {
                if (wikiState.history.length > 1) {
                    wikiState.forwardStack.push(wikiState.history.pop());
                    showPage(wikiState.history[wikiState.history.length - 1], false);
                }
            }

            function wikiForward() {
                if (wikiState.forwardStack.length > 0) {
                    wikiState.history.push(wikiState.forwardStack.pop());
                    showPage(wikiState.history[wikiState.history.length - 1], false);
                }
            }

            function updateBreadcrumb(slug) {
                const page = wikiPages.find(function(p) { return p.slug === slug; });
                const bc = document.getElementById('wiki-breadcrumb');
                const homeSlug = wikiPages.length > 0 ? wikiPages[0].slug : 'central';
                bc.innerHTML = '<a href="javascript:void(0)" data-page="' + homeSlug + '" style="cursor: pointer; color: #475569; text-decoration: none; font-weight: 500;">Home</a>' + (page && page.slug !== homeSlug ? ' > ' + page.title : '');
            }

            function updateNavButtons() {
                document.getElementById('wiki-back').disabled = wikiState.history.length <= 1;
                document.getElementById('wiki-forward').disabled = wikiState.forwardStack.length === 0;
            }

            function updateActiveSidebar(slug) {
                const list = document.getElementById('wiki-page-list');
                list.querySelectorAll('a').forEach(function(a) {
                    if (a.getAttribute('data-page') === slug) {
                        a.classList.add('active');
                    } else {
                        a.classList.remove('active');
                    }
                });
            }

            function wikiNavigateTo(slug) {
                showPage(slug);
            }

            initWiki();
        `;
    }

    private getImageRestorationScript(): string {
        const imagesObject: Record<string, string> = {};
        for (const [hash, base64] of this.imageCache) {
            imagesObject[hash] = base64;
        }

        return `
            const images = ${JSON.stringify(imagesObject)};
            function restoreImages() {
                document.querySelectorAll('img[data-hash]').forEach(function(img) {
                    const hash = img.getAttribute('data-hash');
                    if (hash && images[hash]) {
                        img.src = images[hash];
                    }
                });
            }
            restoreImages();
        `;
    }
}

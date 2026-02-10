import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import HtmlRenderer from './htmlRenderer';
import { LinkResolver } from './linkResolver';
import { fillTemplate } from './templateUtils';
import { debugLogger } from './debugLogger';
import { hideLanguageIdentifiers, restoreLanguageIdentifiers, parseLanguagesString } from './codeBlockProcessor';
import template from './wikiTemplates/template.html?raw';
import styles from './wikiTemplates/styles.css?raw';
import signals from './wikiTemplates/signals.js?raw';
import helpers from './wikiTemplates/helpers.js?raw';
import appTemplate from './wikiTemplates/app.js?raw';

export interface WikiRenderOptions {
    imageQuality: 'high' | 'medium' | 'low';
    enableLazyLoading: boolean;
    enableImageDeduplication: boolean;
    linkDepth: number;
    includeUnlinked: boolean;
    wikiTitle?: string;
    enableThemeToggle?: boolean;
    enableInlineTOC?: boolean;
    defaultTheme?: 'light' | 'dark';
    disableSyntaxHighlighting?: boolean;
}

export interface PageInfo {
    slug: string;
    title: string;
    path: string;
}

export default class WikiHtmlRenderer extends HtmlRenderer {
    protected linkResolver: LinkResolver;
    protected pageList: PageInfo[] = [];
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

        const totalPages = collectedFiles.length;
        const CHUNK_SIZE = 5;

        for (let i = 0; i < collectedFiles.length; i += CHUNK_SIZE) {
            const chunk = collectedFiles.slice(i, i + CHUNK_SIZE);

            const results = await Promise.all(
                chunk.map(async (file) => {
                    const slug = this.linkResolver.slugify(file.basename);
                    const content = await this.app.vault.cachedRead(file);
                    const html = await this.renderPage(content);
                    return [slug, html] as [string, string];
                })
            );

            results.forEach(([slug, html]) => renderedPages.set(slug, html));

            await new Promise(resolve => setTimeout(resolve, 0));

            progressCallback(Math.min(i + CHUNK_SIZE, totalPages), totalPages);
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

    /**
     * Render a single note file to HTML
     * This is the new preferred method for rendering from orchestrator
     */
    async renderPageFromFile(file: TFile): Promise<string> {
        debugLogger.logNoteStart(file.path);
        const content = await this.app.vault.cachedRead(file);
        const html = await this.renderPage(content);
        debugLogger.logNoteEnd(file.path);
        return html;
    }

    async renderPage(markdownContent: string): Promise<string> {
        const { content: resolvedContent } = this.linkResolver.resolveLinks(markdownContent);

        // Pre-process: hide language identifiers to prevent syntax highlighting
        const languages = parseLanguagesString(this.settings.syntaxHighlightLanguages || '');
        const processedContent = this.settings.disableSyntaxHighlighting !== false
            ? hideLanguageIdentifiers(resolvedContent, languages)
            : resolvedContent;

        const el = document.body.createDiv();
        await MarkdownRenderer.render(this.app, processedContent, el, '.', this.component);

        // Post-process: restore language identifiers
        if (this.settings.disableSyntaxHighlighting !== false) {
            restoreLanguageIdentifiers(el);
        }

        el.querySelectorAll('.copy-code-button').forEach((e) => {
            e.remove();
        });

        const imgElements = el.querySelectorAll('img');
        const imagePromises = Array.from(imgElements).map(async (img) => {
            const src = img.src;
            if (src) {
                if (this.settings.enableImageDeduplication) {
                    const hash = await this.convertImageToHash(src);
                    // Log image processing for debug
                    const isCacheHit = this.imageCache.has(hash);
                    debugLogger.logImageProcessed(true, isCacheHit);
                    img.setAttribute('data-hash', hash);
                    img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
                    if (this.settings.enableLazyLoading) {
                        img.setAttribute('loading', 'lazy');
                    }
                } else {
                    await this.convertImageToBase64String(src);
                    debugLogger.logImageProcessed(false, false);
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

        let html = el.innerHTML;
        html = this.addHeadingIds(html);

        return html;
    }

    protected addHeadingIds(html: string): string {
        const idCounter: Record<string, number> = {};
        
        return html.replace(/<h([123])[^>]*>([^<]+)<\/h\1>/g, (_match, level, text) => {
            let baseId = text
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            
            if (!idCounter[baseId]) {
                idCounter[baseId] = 0;
            }
            idCounter[baseId]++;
            const id = idCounter[baseId] === 1 ? baseId : `${baseId}-${idCounter[baseId]}`;
            
            return `<h${level} id="${id}">${text}</h${level}>`;
        });
    }

    private generateWikiHtml(centralFile: TFile, renderedPages: Map<string, string>): string {
        const options = this.settings as WikiRenderOptions;
        const wikiTitle = options.wikiTitle || centralFile.basename;
        const defaultTheme = options.defaultTheme || 'light';
        const centralSlug = this.pageList.length > 0 ? this.pageList[0].slug : 'central';
        const pagesJson = JSON.stringify(this.pageList);
        const imageRestoration = this.settings.enableImageDeduplication ? this.getImageRestorationScript() : '';

        const scripts = fillTemplate(appTemplate, {
            CENTRAL_SLUG: centralSlug,
            DEFAULT_THEME: defaultTheme,
            WIKI_PAGES: pagesJson,
            IMAGE_RESTORATION: imageRestoration
        });

        return fillTemplate(template, {
            WIKI_TITLE: wikiTitle,
            DEFAULT_THEME: defaultTheme,
            STYLES: styles,
            CONTENT: this.getWikiHtmlStructure(renderedPages),
            SCRIPTS: signals + '\n' + helpers + '\n' + scripts
        });
    }

    /**
     * Generate wiki HTML from already rendered pages
     * Used by the orchestrator when notes have been selected
     */
    generateWikiHtmlWithRenderedPages(
        centralFile: TFile, 
        renderedPages: Map<string, string>,
        pageList: PageInfo[]
    ): string {
        const options = this.settings as WikiRenderOptions;
        const wikiTitle = options.wikiTitle || centralFile.basename;
        const defaultTheme = options.defaultTheme || 'light';
        const centralSlug = pageList.length > 0 ? pageList[0].slug : 'central';
        const pagesJson = JSON.stringify(pageList);
        const imageRestoration = this.settings.enableImageDeduplication ? this.getImageRestorationScript() : '';

        const scripts = fillTemplate(appTemplate, {
            CENTRAL_SLUG: centralSlug,
            DEFAULT_THEME: defaultTheme,
            WIKI_PAGES: pagesJson,
            IMAGE_RESTORATION: imageRestoration
        });

        // Temporarily set pageList for getWikiHtmlStructure
        const originalPageList = this.pageList;
        this.pageList = pageList;

        const html = fillTemplate(template, {
            WIKI_TITLE: wikiTitle,
            DEFAULT_THEME: defaultTheme,
            STYLES: styles,
            CONTENT: this.getWikiHtmlStructure(renderedPages),
            SCRIPTS: signals + '\n' + helpers + '\n' + scripts
        });

        // Restore original pageList
        this.pageList = originalPageList;

        return html;
    }

    private getWikiHtmlStructure(renderedPages: Map<string, string>): string {
        const options = this.settings as WikiRenderOptions;
        const centralSlug = this.pageList.length > 0 ? this.pageList[0].slug : 'central';
        const centralTitle = this.pageList.length > 0 ? this.pageList[0].title : 'Wiki';
        const noteCount = this.pageList.length;
        const showThemeToggle = options.enableThemeToggle !== false;
        const showInlineTOC = options.enableInlineTOC !== false;

        return `
    <div class="wiki-container">
        <aside class="wiki-sidebar" id="wiki-sidebar">
            <div class="wiki-sidebar-header">
                <div class="wiki-search">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input type="text" id="wiki-search-input" placeholder="Search ${noteCount} notes...">
                </div>
            </div>
            <nav class="wiki-toc">
                <h3>Contents</h3>
                <ul id="wiki-page-list"></ul>
            </nav>
        </aside>

        <main class="wiki-main" id="wiki-main">
            <div class="wiki-content">
                <div class="wiki-header">
                    <button id="wiki-sidebar-toggle" title="Toggle sidebar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="4" x2="20" y1="12" y2="12"/>
                            <line x1="4" x2="20" y1="6" y2="6"/>
                            <line x1="4" x2="20" y1="18" y2="18"/>
                        </svg>
                    </button>
                    <div class="wiki-nav">
                        <button id="wiki-back" disabled title="Back">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="m12 19-7-7 7-7"/>
                                <path d="M19 12H5"/>
                            </svg>
                        </button>
                        <button id="wiki-forward" disabled title="Forward">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 12h14"/>
                                <path d="m12 5 7 7-7 7"/>
                            </svg>
                        </button>
                    </div>
                    <nav class="wiki-breadcrumb" id="wiki-breadcrumb">
                        <a href="javascript:void(0)" data-page="${centralSlug}">${centralTitle}</a>
                    </nav>
                    
                    ${showInlineTOC || showThemeToggle ? `
                    <div class="theme-toggle">
                        ${showInlineTOC ? `
                        <button id="toc-toggle" title="Toggle outline" aria-expanded="false">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="21" y1="10" x2="7" y2="10"/>
                                <line x1="21" y1="6" x2="3" y2="6"/>
                                <line x1="21" y1="14" x2="3" y2="14"/>
                                <line x1="21" y1="18" x2="7" y2="18"/>
                            </svg>
                        </button>
                        ` : ''}
                        ${showThemeToggle ? `
                        <button id="theme-toggle" title="Toggle theme">
                            <svg id="theme-icon-sun" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                                <circle cx="12" cy="12" r="5"/>
                                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                            </svg>
                            <svg id="theme-icon-moon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                            </svg>
                        </button>
                        ` : ''}
                    </div>
                    ` : ''}
                </div>
  
                ${showInlineTOC ? `
                <div class="wiki-body-layout toc-collapsed" id="wiki-body-layout">
                    <div class="wiki-article">
                        ${this.generatePageSections(renderedPages)}
                    </div>
 
                    <aside class="wiki-inline-toc collapsed" id="wiki-inline-toc">
                        <div class="wiki-inline-toc-header">
                            <h3>On this page</h3>
                        </div>
                        <div class="wiki-inline-toc-body" id="wiki-inline-toc-body">
                            <ul id="page-toc-list"></ul>
                        </div>
                    </aside>
                </div>
                ` : `
                <div class="wiki-body-layout">
                    <div class="wiki-article">
                        ${this.generatePageSections(renderedPages)}
                    </div>
                </div>
                `}
            </div>
        </main>
    </div>`;
    }

    private generatePageSections(renderedPages: Map<string, string>): string {
        return this.pageList.map(page => {
            const html = renderedPages.get(page.slug) || '';
            const isActive = page.slug === this.pageList[0].slug ? ' active' : '';
            return `<div id="page-${page.slug}" class="wiki-page markdown-body${isActive}" data-title="${page.title}">${html}</div>`;
        }).join('\n');
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

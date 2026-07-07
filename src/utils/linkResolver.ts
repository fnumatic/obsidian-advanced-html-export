export interface LinkInfo {
    original: string;
    target: string;
    rawTarget: string;
    alias: string;
    type: 'wiki' | 'markdown' | 'image-embed';
}

export class LinkResolver {
    private vaultFiles: Map<string, string> = new Map();
    private pageSlugResolver: ((rawTarget: string) => string | null) | null = null;

    constructor(vaultFiles?: Map<string, string>) {
        if (vaultFiles) {
            this.vaultFiles = vaultFiles;
        }
    }

    setVaultFiles(files: Map<string, string>): void {
        this.vaultFiles = files;
    }

    setPageSlugResolver(resolver: (rawTarget: string) => string | null): void {
        this.pageSlugResolver = resolver;
    }

    /** Check if a file is an excalidraw file (true .excalidraw or .excalidraw.md) */
    static isExcalidrawFile(file: { extension: string; basename: string }): boolean {
        return file.extension === 'excalidraw'
            || (file.extension === 'md' && /\.excalidraw$/i.test(file.basename));
    }

    /** Get the correct page slug for a file */
    getFileSlug(file: { extension: string; basename: string }): string {
        if (LinkResolver.isExcalidrawFile(file)) {
            return this.slugify(file.basename.replace(/\.excalidraw$/i, ''));
        }
        return this.slugify(file.basename);
    }

    slugify(title: string): string {
        return title
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/--+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    extractLinks(content: string): LinkInfo[] {
        const links: LinkInfo[] = [];

        // Match wiki links: both [[...]] and ![[...]]
        const wikiLinkRegex = /!?\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
        let match;

        while ((match = wikiLinkRegex.exec(content)) !== null) {
            const fullMatch = match[0];
            const target = match[1].trim();
            const alias = match[2] ? match[2].trim() : target;
            
            // Check if this is an image embed (starts with ![[)
            const isImageEmbed = fullMatch.startsWith('![');

            links.push({
                original: fullMatch,
                target: this.slugify(target),
                rawTarget: target,
                alias: alias,
                type: isImageEmbed ? 'image-embed' : 'wiki'
            });
        }

        const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

        while ((match = markdownLinkRegex.exec(content)) !== null) {
            const fullMatch = match[0];
            const alias = match[1].trim();
            const href = match[2].trim();

            if (href.startsWith('#') || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
                continue;
            }

            const target = this.resolvePath(href, '');
            if (target) {
                links.push({
                    original: fullMatch,
                    target: target,
                    rawTarget: href,
                    alias: alias,
                    type: 'markdown'
                });
            }
        }

        return links;
    }

    resolvePath(linkTarget: string, basePath: string): string {
        let resolvedPath = linkTarget;

        if (linkTarget.startsWith('./')) {
            resolvedPath = basePath + linkTarget.substring(1);
        } else if (linkTarget.startsWith('../')) {
            const baseParts = basePath.split('/');
            let prefix = '';
            let rest = linkTarget;

            while (rest.startsWith('../')) {
                baseParts.pop();
                rest = rest.substring(3);
            }

            if (baseParts.length > 0) {
                prefix = baseParts.join('/') + '/';
            }

            resolvedPath = prefix + rest;
        }

        resolvedPath = resolvedPath.replace(/\.md$/i, '');

        const slug = this.slugify(resolvedPath.split('/').pop() || resolvedPath);

        return slug;
    }

    resolveLinks(content: string): { content: string; links: LinkInfo[] } {
        const links = this.extractLinks(content);
        let resolvedContent = content;

        // First pass: protect image-embeds with placeholders to prevent
        // substring collision when [[x]] appears inside ![[x]]
        const embedPlaceholders: string[] = [];
        for (const link of links) {
            if (link.type === 'image-embed') {
                const placeholder = `\x00EMBED${embedPlaceholders.length}\x00`;
                embedPlaceholders.push(link.original);
                resolvedContent = resolvedContent.replace(link.original, placeholder);
            }
        }

        // Second pass: replace wiki links with anchor tags
        for (const link of links) {
            if (link.type === 'wiki') {
                let pageSlug = link.target;
                if (this.pageSlugResolver && link.rawTarget) {
                    const resolvedSlug = this.pageSlugResolver(link.rawTarget);
                    if (resolvedSlug) {
                        pageSlug = resolvedSlug;
                    }
                }
                const replacement = `<a href="javascript:void(0)" data-page="${pageSlug}" style="cursor: pointer;">${link.alias}</a>`;
                resolvedContent = resolvedContent.replace(link.original, replacement);
            }
        }

        // Third pass: restore image-embeds from placeholders
        for (const original of embedPlaceholders) {
            resolvedContent = resolvedContent.replace(/\x00EMBED\d+\x00/, original);
        }

        return {
            content: resolvedContent,
            links: links
        };
    }

    findFileByLink(linkTarget: string, basePath: string = ''): string | null {
        const resolvedPath = this.resolvePath(linkTarget, basePath);
        const targetBasename = this.slugify(linkTarget.split('/').pop() || linkTarget);

        for (const [path] of this.vaultFiles) {
            const normalizedPath = path.toLowerCase().replace(/\.md$/i, '');
            const normalizedResolved = resolvedPath.toLowerCase();

            if (normalizedPath === normalizedResolved) {
                return path;
            }

            if (normalizedPath.endsWith('/' + normalizedResolved)) {
                return path;
            }

            const pathParts = path.split('/');
            const fileName = pathParts[pathParts.length - 1];
            const fileNameWithoutExt = fileName.replace(/\.md$/i, '');
            const fileNameSlug = this.slugify(fileNameWithoutExt);

            if (fileNameSlug === targetBasename) {
                return path;
            }
        }

        return null;
    }
}

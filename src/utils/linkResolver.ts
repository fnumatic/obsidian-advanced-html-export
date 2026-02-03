export interface LinkInfo {
    original: string;
    target: string;
    alias: string;
    type: 'wiki' | 'markdown';
}

export class LinkResolver {
    private vaultFiles: Map<string, string> = new Map();

    constructor(vaultFiles?: Map<string, string>) {
        if (vaultFiles) {
            this.vaultFiles = vaultFiles;
        }
    }

    setVaultFiles(files: Map<string, string>): void {
        this.vaultFiles = files;
    }

    slugify(title: string): string {
        return title
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    extractLinks(content: string): LinkInfo[] {
        const links: LinkInfo[] = [];

        const wikiLinkRegex = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
        let match;

        while ((match = wikiLinkRegex.exec(content)) !== null) {
            const fullMatch = match[0];
            const target = match[1].trim();
            const alias = match[2] ? match[2].trim() : target;

            links.push({
                original: fullMatch,
                target: this.slugify(target),
                alias: alias,
                type: 'wiki'
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

        for (const link of links) {
            const replacement = `<a href="javascript:void(0)" data-page="${link.target}" style="cursor: pointer;">${link.alias}</a>`;
            resolvedContent = resolvedContent.replace(link.original, replacement);
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

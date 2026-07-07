import { App, TFile } from 'obsidian';
import { LinkResolver } from './linkResolver';

export interface CollectedFile {
    file: TFile;
    depth: number;
}

export class WikiLinkCollector {
    private app: App;
    private linkResolver: LinkResolver;
    private vaultFiles: Map<string, TFile> = new Map();
    private viewableFiles: Map<string, TFile> = new Map();

    constructor(app: App, linkResolver: LinkResolver) {
        this.app = app;
        this.linkResolver = linkResolver;
        this.initializeVaultFiles();
    }

    private initializeVaultFiles(): void {
        const files = this.app.vault.getFiles();

        for (const file of files) {
            const key = file.path.toLowerCase();
            if (file.extension === 'md' && !LinkResolver.isViewableFile(file)) {
                this.vaultFiles.set(key, file);
            } else if (LinkResolver.isViewableFile(file)) {
                this.viewableFiles.set(key, file);
            }
        }

        const fileMap = new Map<string, string>();
        for (const [key, file] of this.vaultFiles) {
            fileMap.set(key, file.path);
        }
        this.linkResolver.setVaultFiles(fileMap);

        this.linkResolver.setPageSlugResolver((rawTarget: string) => {
            const file = this.findFileByLink(rawTarget);
            if (file) {
                return {
                    slug: this.linkResolver.getFileSlug(file),
                    resolved: true,
                };
            }
            return {
                slug: null,
                resolved: false,
            };
        });
    }

    findFileByLink(linkTarget: string): TFile | null {
        const lowerTarget = linkTarget.toLowerCase();

        // 1. Exact path match on markdown files
        const mdExact = this.vaultFiles.get(lowerTarget) as TFile | undefined;
        if (mdExact) return mdExact;

        // 2. Exact path + .md
        const mdWithExt = this.vaultFiles.get(lowerTarget + '.md') as TFile | undefined;
        if (mdWithExt) return mdWithExt;

        // 3. Exact path match on viewable files
        const vwExact = this.viewableFiles.get(lowerTarget) as TFile | undefined;
        if (vwExact) return vwExact;

        // 4. Basename fallback for markdown (backward compat)
        const targetSlug = this.linkResolver.slugify(linkTarget.replace(/\.md$/i, ''));
        for (const file of this.vaultFiles.values()) {
            if (this.linkResolver.slugify(file.basename) === targetSlug) {
                return file;
            }
        }

        // 5. Viewable with extension (e.g. diagram.excalidraw)
        const rawSlug = this.linkResolver.slugify(linkTarget);
        for (const file of this.viewableFiles.values()) {
            if (this.linkResolver.slugify(file.basename) === rawSlug) {
                return file;
            }
        }

        // 6. Viewable without extension (e.g., diagram → diagram.excalidraw)
        const noExtTarget = linkTarget.replace(/\.\w+$/i, '');
        const noExtSlug = this.linkResolver.slugify(noExtTarget);
        if (noExtSlug !== rawSlug) {
            for (const file of this.viewableFiles.values()) {
                if (this.linkResolver.slugify(file.basename) === noExtSlug) {
                    return file;
                }
            }
        }

        return null;
    }

    async collectLinkedFiles(root: TFile, maxDepth: number, shouldIncludeFile?: (file: TFile) => boolean): Promise<CollectedFile[]> {
        const visited = new Set<string>();
        const queue: Array<{ file: TFile; depth: number }> = [{ file: root, depth: 0 }];
        const result: CollectedFile[] = [];

        while (queue.length > 0) {
            const { file, depth } = queue.shift()!;

            if (visited.has(file.path)) continue;
            visited.add(file.path);

            // Exclude check: stop traversal for excluded files
            if (shouldIncludeFile && !shouldIncludeFile(file)) {
                continue;
            }

            result.push({ file, depth });

            if (depth >= maxDepth) continue;

            const content = await this.app.vault.cachedRead(file);
            const links = this.linkResolver.extractLinks(content);

            for (const link of links) {
                if (link.type === 'image-embed') continue;

                const targetFile = this.findFileByLink(link.rawTarget);
                if (targetFile && !visited.has(targetFile.path)) {
                    queue.push({ file: targetFile, depth: depth + 1 });
                }
            }
        }

        return result;
    }
}

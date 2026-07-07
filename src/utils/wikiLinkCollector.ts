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
        const vault = this.app.vault;
        const files = vault.getFiles();

        for (const file of files) {
            if (file.extension === 'md' && !LinkResolver.isViewableFile(file)) {
                this.vaultFiles.set(file.path, file);
                this.vaultFiles.set(file.basename, file);
            } else if (LinkResolver.isViewableFile(file)) {
                this.viewableFiles.set(file.path, file);
                this.viewableFiles.set(file.basename, file);
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
                return this.linkResolver.getFileSlug(file);
            }
            return null;
        });
    }

    findFileByLink(linkTarget: string): TFile | null {
        // 1. Try markdown files
        const cleanTarget = linkTarget.replace(/\.md$/i, '');
        const targetSlug = this.linkResolver.slugify(cleanTarget);

        for (const [, file] of this.vaultFiles) {
            const fileNameSlug = this.linkResolver.slugify(file.basename.replace(/\.md$/i, ''));
            if (fileNameSlug === targetSlug) {
                return file;
            }
        }

        // 2. Try viewable non-md files (match with extension, e.g. diagram.excalidraw)
        const rawSlug = this.linkResolver.slugify(linkTarget);
        for (const [, file] of this.viewableFiles) {
            const fileSlug = this.linkResolver.slugify(file.basename);
            if (fileSlug === rawSlug) {
                return file;
            }
        }

        // 3. Try without extension (e.g., diagram → diagram.excalidraw)
        const noExtTarget = linkTarget.replace(/\.\w+$/i, '');
        const noExtSlug = this.linkResolver.slugify(noExtTarget);
        if (noExtSlug !== rawSlug) {
            for (const [, file] of this.viewableFiles) {
                const fileSlug = this.linkResolver.slugify(file.basename);
                if (fileSlug === noExtSlug) {
                    return file;
                }
            }
        }

        return null;
    }

    async collectLinkedFiles(root: TFile, maxDepth: number): Promise<CollectedFile[]> {
        const visited = new Set<string>();
        const queue: Array<{ file: TFile; depth: number }> = [{ file: root, depth: 0 }];
        const result: CollectedFile[] = [];

        while (queue.length > 0) {
            const { file, depth } = queue.shift()!;

            if (visited.has(file.path)) continue;
            visited.add(file.path);

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

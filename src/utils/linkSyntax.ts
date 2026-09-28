/**
 * Shared link/embed syntax used by both the link resolver (export) and the
 * content analysis (metrics), so the patterns cannot drift apart.
 */

/**
 * Matches wiki links and embeds: `[[target]]`, `[[target|alias]]` and
 * `![[embed]]`. Captures group 1 = target, group 2 = optional alias.
 * A fresh regex is returned because the caller iterates it with `exec`.
 */
export function wikiLinkPattern(): RegExp {
  return /!?\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;
}

/**
 * Matches markdown links and images: `[text](target)` / `![alt](target)`.
 * Captures group 1 = text, group 2 = target. Fresh regex per call.
 */
export function markdownLinkPattern(): RegExp {
  return /\[([^\]]+)\]\(([^)]+)\)/g;
}

/** Matches markdown images and captures the target: `![alt](target)`. */
export function markdownImageTargetPattern(): RegExp {
  return /!\[.*?\]\((.*?)\)/g;
}

/**
 * True for links that do not point into the vault (anchors, external URLs,
 * mail addresses) and are therefore not exported as internal links.
 */
export function isExternalLink(target: string): boolean {
  return (
    target.startsWith('#') ||
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('mailto:')
  );
}

const LANG_PREFIX = '__lang_';
const LANG_SUFFIX = '__';

/**
 * Ersetzt Sprach-Klassen in Markdown vor dem Rendering
 * ```json → ```__lang_json__
 */
export function hideLanguageIdentifiers(markdown: string): string {
  return markdown.replace(/```(\w+)/g, `\`\`\`${LANG_PREFIX}$1${LANG_SUFFIX}`);
}

/**
 * Stellt Sprach-Klassen im gerenderten HTML wieder her
 * language-__lang_json__ → language-json
 * Auch für <pre> Tags
 */
export function restoreLanguageIdentifiers(element: HTMLElement): void {
  // Restore <pre> tags
  const preBlocks = element.querySelectorAll('pre[class*="language-"]');
  preBlocks.forEach(pre => {
    const className = pre.className;
    if (!className) return;
    const classes = className.split(' ');
    const newClasses = classes.map(cls => {
      if (cls.startsWith(`language-${LANG_PREFIX}`)) {
        const lang = cls.slice(`language-${LANG_PREFIX}`.length, -LANG_SUFFIX.length);
        return `language-${lang}`;
      }
      return cls;
    });
    pre.className = newClasses.join(' ');
  });

  // Restore <code> tags
  const codeBlocks = element.querySelectorAll('pre code[class*="language-"]');
  codeBlocks.forEach(block => {
    const className = block.className;
    if (!className) return;
    const classes = className.split(' ');
    const newClasses = classes.map(cls => {
      if (cls.startsWith(`language-${LANG_PREFIX}`)) {
        const lang = cls.slice(`language-${LANG_PREFIX}`.length, -LANG_SUFFIX.length);
        return `language-${lang}`;
      }
      return cls;
    });
    block.className = newClasses.join(' ');
  });
}

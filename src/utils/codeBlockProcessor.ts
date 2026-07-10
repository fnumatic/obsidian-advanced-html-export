const LANG_PREFIX = '__lang_';
const LANG_SUFFIX = '__';

export const DEFAULT_SYNTAX_HIGHLIGHT_LANGUAGES = new Set([
  'javascript', 'typescript', 'jsx', 'tsx', 'html', 'xml', 'css', 'scss', 'sass',
  'c', 'cpp', 'c++', 'h', 'hpp', 'c#', 'csharp', 'cs', 'java', 'rust', 'go',
  'ruby', 'swift', 'kotlin', 'scala', 'objective-c', 'objectivec', 'objc',
  'python', 'py', 'perl', 'php', 'lua', 'raku', 'bash', 'sh', 'shell',
  'powershell', 'ps1', 'cmd', 'batch', 'awk', 'tcl',
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'ini', 'toml',
  'sql', 'pgsql', 'postgresql', 'mysql', 'sqlite',
  'haskell', 'ocaml', 'fsharp', 'erlang', 'elixir', 'clojure',
  'dart', 'flutter', 'groovy', 'gradle', 'maven',
  'dockerfile', 'docker', 'cmake', 'makefile',
  'markdown', 'md', 'latex', 'tex', 'asciidoc', 'adoc',
  'protobuf', 'proto', 'thrift', 'graphql',
  'diff', 'patch', 'vim',
  'cfg', 'conf', 'config', 'env', 'dotenv',
  'nginx', 'apache', 'apacheconf', 'lighttpd',
  'terraform', 'hcl', 'ansible', 'puppet',
  'r', 'julia', 'matlab', 'octave',
  'ant',
  'xsl', 'xslt', 'htm', 'xhtml',
  'less', 'stylus', 'postcss',
  'coffeescript', 'livescript',
  'actionscript', 'flash', 'flex',
  'pascal', 'delphi', 'lazarus', 'fpc',
  'basic', 'vb', 'vbnet', 'vba', 'vbscript',
  'ecmascript', 'extend',
  'd', 'dlang', 'dylan',
  'fortran', 'f77', 'f90', 'f95', 'f03', 'f08',
  'prolog', 'clips', 'clipper', 'foxpro',
  'scheme', 'racket', 'lisp', 'commonlisp', 'cl',
  'smalltalk', 'pharo', 'squeak',
  'ada', 'modula2', 'modula3', 'oberon',
  'algol', 'algol68', 'algol60',
  'applescript', 'osascript', 'hy',
  'io', 'moo', 'murphi', 'promela',
  'qmake', 'qmakefile',
  'x86asm', 'armasm', 'mipsasm', 'nasm', 'fasm',
  'context', 'bibtex',
  'restructuredtext', 'rst', 'text', 'plain',
  'tap',
]);

/**
 * Hides code block language identifiers before MarkdownRenderer runs.
 * ```json -> ```__lang_json__
 * Only languages in the allowlist are replaced (mermaid, plantuml, etc. are left untouched)
 */
export function hideLanguageIdentifiers(markdown: string, languages?: Set<string>): string {
  const langSet = languages || DEFAULT_SYNTAX_HIGHLIGHT_LANGUAGES;

  return markdown.replace(/```(\w+)(\s*)/g, (match, lang, trailingSpace) => {
    const normalizedLang = lang.toLowerCase();
    if (langSet.has(normalizedLang)) {
      return `\`\`\`${LANG_PREFIX}${lang}${LANG_SUFFIX}${trailingSpace}`;
    }
    return match;
  });
}

/**
 * Parses a comma-separated list of languages into a Set
 */
export function parseLanguagesString(languagesStr: string): Set<string> {
  return new Set(
    languagesStr
      .split(',')
      .map(l => l.trim().toLowerCase())
      .filter(l => l.length > 0)
  );
}

/**
 * Restores code block language identifiers after MarkdownRenderer runs.
 * language-__lang_json__ -> language-json
 * Also handles <pre> tags
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

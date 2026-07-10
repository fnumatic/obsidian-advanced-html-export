import { describe, it, expect } from 'vitest';
import {
  hideLanguageIdentifiers,
  restoreLanguageIdentifiers,
  parseLanguagesString,
  DEFAULT_SYNTAX_HIGHLIGHT_LANGUAGES,
} from './codeBlockProcessor';

describe('DEFAULT_SYNTAX_HIGHLIGHT_LANGUAGES', () => {
  it('has no duplicate entries', () => {
    const langs = Array.from(DEFAULT_SYNTAX_HIGHLIGHT_LANGUAGES);
    const unique = new Set(langs);
    expect(unique.size).toBe(langs.length);
  });

  it('has no chinese characters', () => {
    for (const lang of DEFAULT_SYNTAX_HIGHLIGHT_LANGUAGES) {
      expect(lang).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it('contains commonly used languages', () => {
    expect(DEFAULT_SYNTAX_HIGHLIGHT_LANGUAGES.has('javascript')).toBe(true);
    expect(DEFAULT_SYNTAX_HIGHLIGHT_LANGUAGES.has('python')).toBe(true);
    expect(DEFAULT_SYNTAX_HIGHLIGHT_LANGUAGES.has('json')).toBe(true);
  });
});

describe('hideLanguageIdentifiers', () => {
  it('replaces allowed language in fenced code block', () => {
    const result = hideLanguageIdentifiers('```json\n{"a":1}\n```');
    expect(result).toContain('```__lang_json__');
  });

  it('does not replace languages not in the set', () => {
    const result = hideLanguageIdentifiers('```mermaid\ngraph TD\n```');
    expect(result).toContain('```mermaid');
    expect(result).not.toContain('__lang_');
  });

  it('accepts a custom set', () => {
    const custom = new Set(['customlang']);
    const result = hideLanguageIdentifiers('```customlang\ncode\n```', custom);
    expect(result).toContain('```__lang_customlang__');
  });

  it('falls back to DEFAULT when no set is given', () => {
    const result = hideLanguageIdentifiers('```python\nprint("hi")\n```');
    expect(result).toContain('```__lang_python__');
  });
});

describe('parseLanguagesString', () => {
  it('parses comma-separated languages', () => {
    const result = parseLanguagesString('js, ts,  json');
    expect(result.has('js')).toBe(true);
    expect(result.has('ts')).toBe(true);
    expect(result.has('json')).toBe(true);
    expect(result.size).toBe(3);
  });

  it('returns empty set for empty string', () => {
    expect(parseLanguagesString('').size).toBe(0);
  });

  it('normalizes to lowercase', () => {
    const result = parseLanguagesString('TypeScript, JSON');
    expect(result.has('typescript')).toBe(true);
    expect(result.has('json')).toBe(true);
  });
});

describe('restoreLanguageIdentifiers', () => {
  function createMockEl(innerHtml: string, preClass = '', codeClass = ''): HTMLElement {
    const pre = {
      className: preClass,
      querySelectorAll: (_s: string) => [],
      tagName: 'PRE',
    } as unknown as HTMLElement;

    const code = {
      className: codeClass,
      tagName: 'CODE',
    } as unknown as HTMLElement;

    const el = {
      innerHTML: innerHtml,
      querySelectorAll: (selector: string) => {
        if (selector === 'pre[class*="language-"]') return preClass ? [pre] : [];
        if (selector === 'pre code[class*="language-"]') return codeClass ? [code] : [];
        return [];
      },
    } as unknown as HTMLElement;

    return el;
  }

  it('restores language class on <pre>', () => {
    const el = createMockEl('<pre class="language-__lang_python__">print</pre>', 'language-__lang_python__');
    restoreLanguageIdentifiers(el);
    expect(el.querySelectorAll('pre[class*="language-"]')[0]!.className).toBe('language-python');
  });

  it('restores language class on <code> inside <pre>', () => {
    const el = createMockEl(
      '<pre><code class="language-__lang_json__">{}</code></pre>',
      '',
      'language-__lang_json__',
    );
    restoreLanguageIdentifiers(el);
    expect(el.querySelectorAll('pre code[class*="language-"]')[0]!.className).toBe('language-json');
  });

  it('does not modify non-matching classes', () => {
    const el = createMockEl('<pre class="language-python">print</pre>', 'language-python');
    restoreLanguageIdentifiers(el);
    const pre = el.querySelectorAll('pre[class*="language-"]')[0] as HTMLElement;
    expect(pre.className).toBe('language-python');
  });
});

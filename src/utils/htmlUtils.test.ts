import { describe, it, expect } from 'vitest';
import { escapeHtml } from './htmlUtils';

describe('escapeHtml', () => {
  it('escapes the five HTML-sensitive characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('plain text')).toBe('plain text');
  });
});

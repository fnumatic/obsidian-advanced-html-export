import { describe, expect, it } from 'vitest';
import { html, raw } from './view-helpers';

describe('html', () => {
  it('escapes interpolated values', () => {
    const title = '"><img src=x onerror=alert(1)>';
    const markup = html`<span title="${title}">${title}</span>`.value;
    expect(markup).not.toContain('<img');
    expect(markup).toContain('&quot;&gt;&lt;img');
  });

  it('keeps trusted markup and nested arrays intact', () => {
    const markup = html`<ul>${[html`<li>a</li>`, raw('<li>b</li>')]}</ul>`.value;
    expect(markup).toBe('<ul><li>a</li><li>b</li></ul>');
  });
});

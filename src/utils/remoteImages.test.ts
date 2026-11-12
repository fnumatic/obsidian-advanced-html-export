// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { blankRemoteImages, restoreRemoteImages } from './remoteImages';

describe('remote image pre-blanking', () => {
  it('blanks remote images, keeps local ones, and restores sources after rendering', () => {
    const markdown = [
      '![hero](https://example.com/a.png)',
      '![local](app://local/vault/img.png)',
      '![titled](https://example.com/b.png "Title")',
    ].join('\n');
    const { markdown: blanked, images } = blankRemoteImages(markdown);
    expect(images).toEqual([
      { url: 'https://example.com/a.png', alt: 'hero' },
      { url: 'https://example.com/b.png', alt: 'titled' },
    ]);
    expect(blanked).not.toContain('https://example.com/a.png');
    expect(blanked).toContain('app://local/vault/img.png');
    expect(blanked.match(/data:image\/gif;base64/g)).toHaveLength(2);
    expect(blanked).toContain('"Title"');

    const el = document.createElement('div');
    el.innerHTML = '<img alt="__advanced_export_remote_0__" src="data:image/gif;base64,x"><img alt="__advanced_export_remote_1__" src="data:image/gif;base64,x"><img src="app://local/vault/img.png">';
    expect(restoreRemoteImages(el, images)).toBe(2);
    const [first, second, local] = [...el.querySelectorAll('img')];
    expect(first.src).toBe('https://example.com/a.png');
    expect(first.alt).toBe('hero');
    expect(second.src).toBe('https://example.com/b.png');
    expect(second.alt).toBe('titled');
    expect(local.getAttribute('src')).toBe('app://local/vault/img.png');
  });

  it('leaves fenced code blocks untouched', () => {
    const markdown = ['```markdown', '![doc](https://example.com/doc.png)', '```', '![real](https://example.com/real.png)'].join('\n');
    const { markdown: blanked, images } = blankRemoteImages(markdown);
    expect(images).toHaveLength(1);
    expect(blanked).toContain('![doc](https://example.com/doc.png)');
    expect(blanked).not.toContain('https://example.com/real.png');
  });

  it('returns the input unchanged when there is nothing to blank', () => {
    const markdown = '# Title\n\n![local](app://local/a.png)';
    const { markdown: blanked, images } = blankRemoteImages(markdown);
    expect(blanked).toBe(markdown);
    expect(images).toEqual([]);
    expect(restoreRemoteImages(document.createElement('div'), [])).toBe(0);
  });
});

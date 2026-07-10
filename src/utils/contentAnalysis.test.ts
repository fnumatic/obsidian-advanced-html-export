import { describe, it, expect } from 'vitest';
import { analyzeNoteContent } from './contentAnalysis';

describe('analyzeNoteContent', () => {
  it('counts images but does not count them as diagrams', () => {
    const content = [
      '![image1](image1.png)',
      '![image2](image2.jpg)',
      '',
      '```mermaid',
      'graph TD',
      'A --> B',
      '```',
    ].join('\n');

    const result = analyzeNoteContent(content);
    expect(result.imageCount).toBe(2);
    expect(result.diagramCount).toBe(1);
  });

  it('returns imageCount=0 diagramCount=0 for plain text', () => {
    const content = 'Just some text without any markdown elements.';
    const result = analyzeNoteContent(content);
    expect(result.imageCount).toBe(0);
    expect(result.diagramCount).toBe(0);
    expect(result.codeBlockCount).toBe(0);
    expect(result.linkCount).toBe(0);
  });

  it('counts only images when there are no diagrams', () => {
    const content = [
      '![img](img.png)',
      '',
      'Some text',
      '',
      '![another](another.webp)',
    ].join('\n');

    const result = analyzeNoteContent(content);
    expect(result.imageCount).toBe(2);
    expect(result.diagramCount).toBe(0);
  });

  it('counts mermaid, plantuml and graph diagrams separately from code blocks', () => {
    const content = [
      '```mermaid',
      'graph TD; A-->B;',
      '```',
      '',
      '```plantuml',
      'A -> B',
      '```',
      '',
      '```graph',
      'a -> b',
      '```',
      '',
      '```python',
      'print("hello")',
      '```',
    ].join('\n');

    const result = analyzeNoteContent(content);
    expect(result.diagramCount).toBe(3);
    expect(result.codeBlockCount).toBe(1);
    expect(result.imageCount).toBe(0);
  });

  it('counts wiki links and markdown links', () => {
    const content = [
      'See [[Note A]] and [[Note B]] for details.',
      '',
      'Read more at [example](https://example.com).',
    ].join('\n');

    const result = analyzeNoteContent(content);
    expect(result.linkCount).toBe(3);
  });

  it('populates diagrams array with type and content', () => {
    const content = [
      '```mermaid',
      'graph TD; A-->B;',
      '```',
    ].join('\n');

    const result = analyzeNoteContent(content);
    expect(result.diagrams).toHaveLength(1);
    expect(result.diagrams[0].type).toBe('mermaid');
    expect(result.diagrams[0].content).toContain('A-->B');
  });

  it('populates codeBlocks array excluding diagram blocks', () => {
    const content = [
      '```mermaid',
      'graph TD; A-->B;',
      '```',
      '',
      '```javascript',
      'const x = 1;',
      '```',
    ].join('\n');

    const result = analyzeNoteContent(content);
    expect(result.codeBlocks).toHaveLength(1);
    expect(result.codeBlocks[0].language).toBe('javascript');
    expect(result.codeBlocks[0].content).toContain('const x = 1;');
  });

  it('populates images array with src and fileName', () => {
    const content = '![alt](path/to/image.png)';
    const result = analyzeNoteContent(content);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].src).toBe('path/to/image.png');
    expect(result.images[0].fileName).toBe('image.png');
  });
});

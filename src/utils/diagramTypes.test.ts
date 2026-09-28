import { describe, it, expect } from 'vitest';
import { diagramLabelFromClassName, DIAGRAM_LANGUAGES } from './diagramTypes';

describe('diagramLabelFromClassName', () => {
  it('maps known diagram class fragments to labels', () => {
    expect(diagramLabelFromClassName('mermaid')).toBe('Mermaid');
    expect(diagramLabelFromClassName('block-language-plantuml')).toBe('PlantUML');
    expect(diagramLabelFromClassName('excalidraw')).toBe('Excalidraw');
    expect(diagramLabelFromClassName('block-language-graph')).toBe('Graph');
  });

  it('falls back to a generic label', () => {
    expect(diagramLabelFromClassName('paragraph')).toBe('Diagram');
  });
});

describe('DIAGRAM_LANGUAGES', () => {
  it('lists the supported fenced-code diagram languages', () => {
    expect([...DIAGRAM_LANGUAGES]).toEqual(['mermaid', 'plantuml', 'graph']);
  });
});

/**
 * Fenced-code languages that Obsidian (or its diagram plugins) renders as
 * diagrams instead of plain code blocks.
 */
export const DIAGRAM_LANGUAGES = ['mermaid', 'plantuml', 'graph'] as const;

export type DiagramLanguage = (typeof DIAGRAM_LANGUAGES)[number];

/** Display labels keyed by the class-name fragment that identifies a diagram. */
const DIAGRAM_CLASS_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['mermaid', 'Mermaid'],
  ['plantuml', 'PlantUML'],
  ['excalidraw', 'Excalidraw'],
  ['graph', 'Graph'],
];

/** True when a single class token refers to the given diagram fragment. */
function tokenMatchesFragment(token: string, fragment: string): boolean {
  return (
    token === fragment ||
    token === `block-language-${fragment}` ||
    token.startsWith(`${fragment}-`) ||
    token.endsWith(`-${fragment}`)
  );
}

/**
 * Derives a display label from a diagram container's class list.
 * @param className Space separated class list
 * @returns The diagram label, or 'Diagram' when the kind is unknown
 */
export function diagramLabelFromClassName(className: string): string {
  const tokens = className.split(/\s+/).filter(Boolean);
  for (const [fragment, label] of DIAGRAM_CLASS_LABELS) {
    if (tokens.some((token) => tokenMatchesFragment(token, fragment))) return label;
  }
  return 'Diagram';
}

export interface NoteAnalysis {
  diagramCount: number;
  codeBlockCount: number;
  imageCount: number;
  linkCount: number;
  diagrams: Array<{ type: string; content: string }>;
  codeBlocks: Array<{ language: string; content: string }>;
  images: Array<{ src: string; fileName: string }>;
}

export function analyzeNoteContent(content: string): NoteAnalysis {
  const imageMatches = content.match(/!\[.*?\]\(.*?\)/g) || [];

  const mermaidMatches = content.match(/```mermaid[\s\S]*?```/g) || [];
  const plantumlMatches = content.match(/```plantuml[\s\S]*?```/g) || [];
  const graphMatches = content.match(/```graph[\s\S]*?```/g) || [];

  const diagramBlocks = mermaidMatches.length + plantumlMatches.length + graphMatches.length;

  const allCodeBlocks = content.match(/```[\s\S]*?```/g) || [];
  const codeBlockCount = allCodeBlocks.length - diagramBlocks;

  const diagrams = [
    ...mermaidMatches.map(content => ({ type: 'mermaid' as const, content })),
    ...plantumlMatches.map(content => ({ type: 'plantuml' as const, content })),
    ...graphMatches.map(content => ({ type: 'graph' as const, content })),
  ];

  const codeBlocks = allCodeBlocks
    .filter(block => !block.startsWith('```mermaid') && !block.startsWith('```plantuml') && !block.startsWith('```graph'))
    .map(block => {
      const match = block.match(/```(\w+)/);
      return {
        language: match ? match[1] : 'text',
        content: block,
      };
    });

  const images = imageMatches.map(match => {
    const srcMatch = match.match(/!\[.*?\]\((.*?)\)/);
    const src = srcMatch ? srcMatch[1] : '';
    return {
      src,
      fileName: src.split('/').pop() || src,
    };
  });

  const wikiLinks = content.match(/\[\[.*?\]\]/g) || [];
  const markdownLinks = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
  const linkCount = wikiLinks.length + markdownLinks.length;

  return {
    diagramCount: diagramBlocks,
    codeBlockCount,
    imageCount: imageMatches.length,
    linkCount,
    diagrams,
    codeBlocks,
    images,
  };
}

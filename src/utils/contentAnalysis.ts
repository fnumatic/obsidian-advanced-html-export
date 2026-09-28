import { DIAGRAM_LANGUAGES } from './diagramTypes';

export interface NoteAnalysis {
  diagramCount: number;
  codeBlockCount: number;
  imageCount: number;
  linkCount: number;
  diagrams: Array<{ type: string; content: string }>;
  codeBlocks: Array<{ language: string; content: string }>;
  images: Array<{ src: string; fileName: string }>;
}

function isDiagramBlock(block: string): boolean {
  return DIAGRAM_LANGUAGES.some((language) => block.startsWith('```' + language));
}

export function analyzeNoteContent(content: string): NoteAnalysis {
  const imageMatches = content.match(/!\[.*?\]\(.*?\)/g) || [];

  const diagramMatches = DIAGRAM_LANGUAGES.flatMap((language) =>
    (content.match(new RegExp('```' + language + '[\\s\\S]*?```', 'g')) || []).map((block) => ({
      type: language,
      content: block,
    })),
  );
  const diagramBlocks = diagramMatches.length;

  const allCodeBlocks = content.match(/```[\s\S]*?```/g) || [];
  const codeBlockCount = allCodeBlocks.length - diagramBlocks;

  const diagrams = diagramMatches.map((diagram) => ({ type: diagram.type as string, content: diagram.content }));

  const codeBlocks = allCodeBlocks
    .filter(block => !isDiagramBlock(block))
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

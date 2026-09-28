import { DIAGRAM_LANGUAGES } from './diagramTypes';
import { LinkResolver } from './linkResolver';
import { markdownImageTargetPattern } from './linkSyntax';
import { lastPathSegment } from './pathUtils';

export interface NoteAnalysis {
  diagramCount: number;
  codeBlockCount: number;
  imageCount: number;
  linkCount: number;
  diagrams: Array<{ type: string; content: string }>;
  codeBlocks: Array<{ language: string; content: string }>;
  images: Array<{ src: string; fileName: string }>;
}

// Link parsing is shared with the export so it cannot drift from the resolver.
const linkResolver = new LinkResolver();

function isDiagramBlock(block: string): boolean {
  return DIAGRAM_LANGUAGES.some((language) => block.startsWith('```' + language));
}

export function analyzeNoteContent(content: string): NoteAnalysis {
  const images = [...content.matchAll(markdownImageTargetPattern())].map((match) => {
    const src = match[1] ?? '';
    return { src, fileName: lastPathSegment(src) || src };
  });

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

  const linkCount = linkResolver.extractLinks(content).length;

  return {
    diagramCount: diagramBlocks,
    codeBlockCount,
    imageCount: images.length,
    linkCount,
    diagrams,
    codeBlocks,
    images,
  };
}

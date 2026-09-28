/**
 * Pure helpers for the rendering progress view. Kept free of Svelte state so
 * the progress math and event mapping can be unit tested.
 */

import type { CompletedNote, CurrentNoteProgress } from '../components/types';
import type { RenderEvent } from './detailedRenderer';

const DIAGRAM_WEIGHT = 0.3;
const CODEBLOCK_WEIGHT = 0.2;
const IMAGE_WEIGHT = 0.5;

/** Weighted completion (0..1) of the note currently being rendered. */
export function calculateCurrentNoteProgress(currentNote: CurrentNoteProgress | null): number {
  if (!currentNote) return 0;

  const ratio = (processed: number, total: number): number => (total > 0 ? processed / total : 0);

  return (
    ratio(currentNote.diagrams.processed, currentNote.diagrams.total) * DIAGRAM_WEIGHT +
    ratio(currentNote.codeBlocks.processed, currentNote.codeBlocks.total) * CODEBLOCK_WEIGHT +
    ratio(currentNote.images.processed, currentNote.images.total) * IMAGE_WEIGHT
  );
}

/** Formats a duration in milliseconds as `m:ss` or `h:mm:ss`. */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

/** Truncates a title to a maximum length, appending an ellipsis. */
export function truncateTitle(title: string, maxLength: number): string {
  return title.length > maxLength ? title.slice(0, maxLength) + '...' : title;
}

/** Builds the progress snapshot for a note that just started rendering. */
export function currentNoteFromEvent(event: RenderEvent, index: number, total: number): CurrentNoteProgress {
  return {
    title: event.noteTitle || 'Unknown',
    path: event.notePath || '',
    index,
    total,
    diagrams: { total: numberDetail(event, 'totalDiagrams'), processed: 0 },
    codeBlocks: { total: numberDetail(event, 'totalCodeBlocks'), processed: 0 },
    images: { total: numberDetail(event, 'totalImages'), processed: 0 },
    overallProgress: 0,
  };
}

/** Builds the completed-note summary for a note that just finished. */
export function completedNoteFrom(currentNote: CurrentNoteProgress, event: RenderEvent): CompletedNote {
  return {
    title: currentNote.title,
    path: currentNote.path,
    duration: numberDetail(event, 'duration'),
    totalDiagrams: numberDetail(event, 'totalDiagrams'),
    totalCodeBlocks: numberDetail(event, 'totalCodeBlocks'),
    totalImages: numberDetail(event, 'totalImages'),
    linkCount: numberDetail(event, 'linkCount'),
  };
}

/** Returns a new snapshot with one sub-progress updated immutably. */
export function updateNoteProgress(
  currentNote: CurrentNoteProgress,
  type: 'diagrams' | 'codeBlocks' | 'images',
  updates: Partial<{ total: number; processed: number; currentFileName?: string; currentPhase?: string }>,
): CurrentNoteProgress {
  return {
    ...currentNote,
    [type]: {
      ...currentNote[type],
      ...updates,
    },
  };
}

/** Human readable warning for a slow-operation event, or null. */
export function warningMessage(event: RenderEvent): string | null {
  const details = event.details;
  if (details?.operation === 'image_processing') {
    const duration = typeof details.duration === 'number' ? details.duration : 0;
    return `⚠️ Slow operation: ${details.fileName} (${(duration / 1000).toFixed(1)}s)`;
  }
  if (details?.operation === 'markdown_render') {
    const duration = typeof details.duration === 'number' ? details.duration : 0;
    return `⚠️ Note is taking long to render: ${details.noteName} (${(duration / 1000).toFixed(1)}s)`;
  }
  return null;
}

function numberDetail(event: RenderEvent, key: string): number {
  const value = event.details?.[key];
  return typeof value === 'number' ? value : 0;
}

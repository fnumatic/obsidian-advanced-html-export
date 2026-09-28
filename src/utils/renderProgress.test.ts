import { describe, it, expect } from 'vitest';
import {
  calculateCurrentNoteProgress,
  completedNoteFrom,
  currentNoteFromEvent,
  formatDuration,
  truncateTitle,
  updateNoteProgress,
  warningMessage,
} from './renderProgress';
import type { CurrentNoteProgress } from '../components/types';
import type { RenderEvent } from './detailedRenderer';

function note(overrides: Partial<CurrentNoteProgress> = {}): CurrentNoteProgress {
  return {
    title: 'Note',
    path: 'note.md',
    index: 0,
    total: 1,
    diagrams: { total: 2, processed: 1 },
    codeBlocks: { total: 2, processed: 1 },
    images: { total: 2, processed: 1 },
    overallProgress: 0,
    ...overrides,
  };
}

describe('calculateCurrentNoteProgress', () => {
  it('returns 0 without a current note', () => {
    expect(calculateCurrentNoteProgress(null)).toBe(0);
  });

  it('weights diagrams, code blocks and images', () => {
    expect(calculateCurrentNoteProgress(note())).toBeCloseTo(0.5);
    expect(
      calculateCurrentNoteProgress(
        note({
          diagrams: { total: 1, processed: 1 },
          codeBlocks: { total: 1, processed: 1 },
          images: { total: 1, processed: 1 },
        }),
      ),
    ).toBeCloseTo(1);
  });

  it('treats empty categories as complete-neutral', () => {
    expect(
      calculateCurrentNoteProgress(
        note({ diagrams: { total: 0, processed: 0 }, codeBlocks: { total: 0, processed: 0 }, images: { total: 0, processed: 0 } }),
      ),
    ).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(65_000)).toBe('1:05');
  });

  it('formats hours', () => {
    expect(formatDuration(3_661_000)).toBe('1:01:01');
  });
});

describe('truncateTitle', () => {
  it('leaves short titles unchanged', () => {
    expect(truncateTitle('short', 10)).toBe('short');
  });

  it('truncates long titles with an ellipsis', () => {
    expect(truncateTitle('a very long title', 6)).toBe('a very...');
  });
});

describe('currentNoteFromEvent / completedNoteFrom', () => {
  const event: RenderEvent = {
    type: 'note_start',
    timestamp: 1,
    noteTitle: 'My Note',
    notePath: 'folder/My Note.md',
    details: { totalDiagrams: 3, totalCodeBlocks: 2, totalImages: 4 },
  };

  it('builds the current note from a note_start event', () => {
    const result = currentNoteFromEvent(event, 0, 5);
    expect(result.title).toBe('My Note');
    expect(result.index).toBe(0);
    expect(result.total).toBe(5);
    expect(result.diagrams).toEqual({ total: 3, processed: 0 });
    expect(result.images).toEqual({ total: 4, processed: 0 });
  });

  it('builds the completed note from a note_complete event', () => {
    const complete: RenderEvent = {
      type: 'note_complete',
      timestamp: 2,
      details: { duration: 1500, totalDiagrams: 3, totalCodeBlocks: 2, totalImages: 4, linkCount: 7 },
    };
    const result = completedNoteFrom(note(), complete);
    expect(result.duration).toBe(1500);
    expect(result.linkCount).toBe(7);
    expect(result.title).toBe('Note');
  });
});

describe('updateNoteProgress', () => {
  it('updates one category without mutating the input', () => {
    const original = note();
    const updated = updateNoteProgress(original, 'images', { processed: 2 });
    expect(updated.images.processed).toBe(2);
    expect(original.images.processed).toBe(1);
    expect(updated.diagrams).toBe(original.diagrams);
  });
});

describe('warningMessage', () => {
  it('describes slow image processing', () => {
    const event = { type: 'warning_slow_operation', timestamp: 1, details: { operation: 'image_processing', fileName: 'big.png', duration: 2500 } } as RenderEvent;
    expect(warningMessage(event)).toContain('big.png');
  });

  it('describes slow markdown rendering', () => {
    const event = { type: 'warning_slow_operation', timestamp: 1, details: { operation: 'markdown_render', noteName: 'Note', duration: 6000 } } as RenderEvent;
    expect(warningMessage(event)).toContain('Note');
  });

  it('returns null for unrelated events', () => {
    expect(warningMessage({ type: 'note_start', timestamp: 1 })).toBeNull();
  });
});

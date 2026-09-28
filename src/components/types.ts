// src/components/types.ts
// Shared type definitions for Svelte components

import type { ExportMetrics, NoteInfo } from '../utils/wikiExportOrchestrator';
import type { CancellationToken } from '../utils/cancellationToken';
import type { PauseController } from '../utils/pauseController';
import type { RenderEvent } from '../utils/detailedRenderer';
import type { ExportSizeReport } from '../utils/exportSizeReport';

// Export Preview Types
export interface ExportPreviewProps {
  metrics: ExportMetrics;
  notes: NoteInfo[];
  onAction: (action: 'cancel' | 'exportAll' | 'selectNotes') => void;
}

// Export Statistics Types
export interface ExportStatisticsProps {
  report: ExportSizeReport;
  onClose: () => void;
}

// Note Selection Types
export interface NoteSelectionProps {
  notes: NoteInfo[];
  onConfirm: (selected: NoteInfo[]) => void;
  onCancel: () => void;
}

// Rendering Progress Types
export interface CompletedNote {
  title: string;
  path: string;
  duration: number;
  totalDiagrams: number;
  totalCodeBlocks: number;
  totalImages: number;
  linkCount: number;
}

export interface CurrentNoteProgress {
  title: string;
  path: string;
  index: number;
  total: number;
  diagrams: {
    total: number;
    processed: number;
    currentType?: string;
  };
  codeBlocks: {
    total: number;
    processed: number;
    currentLanguage?: string;
  };
  images: {
    total: number;
    processed: number;
    currentFileName?: string;
    currentPhase?: string;
  };
  overallProgress: number;
}

export interface RenderingProgressProps {
  metrics: ExportMetrics;
  token: CancellationToken;
  pauseController: PauseController;
  onComplete: () => void;
  onCancel: () => void;
}

// Re-export for convenience
export type { ExportMetrics, NoteInfo, RenderEvent };

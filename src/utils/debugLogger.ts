interface PhaseLog {
  phase: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  details?: Record<string, unknown>;
}

interface PerformanceMetrics {
  totalDuration: number;
  phases: PhaseLog[];
  notesProcessed: number;
  imagesProcessed: number;
  imagesDeduplicated: number;
  imageCacheHits: number;
  imageCacheHitRate: number;
  averageTimePerNote: number;
  slowestNotes: Array<{ path: string; duration: number }>;
}

class DebugLogger {
  private logs: PhaseLog[] = [];
  private currentPhase: PhaseLog | null = null;
  private noteTimings: Map<string, number> = new Map();
  private imageMetrics = {
    processed: 0,
    deduplicated: 0,
    cacheHits: 0,
  };

  private isDebugMode(): boolean {
    return process.env.NODE_ENV === 'development' || 
           (typeof window !== 'undefined' && window.ADVANCED_HTML_EXPORT_DEBUG === true);
  }

  startPhase(phase: string, details?: Record<string, unknown>): void {
    if (!this.isDebugMode()) return;

    // End any existing phase
    if (this.currentPhase) {
      this.endPhase();
    }

    this.currentPhase = {
      phase,
      startTime: performance.now(),
      details,
    };
  }

  endPhase(): void {
    if (!this.isDebugMode() || !this.currentPhase) return;

    const endTime = performance.now();
    const duration = endTime - this.currentPhase.startTime;

    this.currentPhase.endTime = endTime;
    this.currentPhase.duration = duration;

    this.logs.push({ ...this.currentPhase });

    this.currentPhase = null;
  }

  logNoteStart(path: string): void {
    if (!this.isDebugMode()) return;
    this.noteTimings.set(path, performance.now());
  }

  logNoteEnd(path: string): void {
    if (!this.isDebugMode()) return;
    const startTime = this.noteTimings.get(path);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.noteTimings.set(path, duration);
    }
  }

  logImageProcessed(deduplicated: boolean, cacheHit: boolean): void {
    if (!this.isDebugMode()) return;
    this.imageMetrics.processed++;
    if (deduplicated) this.imageMetrics.deduplicated++;
    if (cacheHit) this.imageMetrics.cacheHits++;
  }

  getMetrics(): PerformanceMetrics {
    const phases = [...this.logs];
    const totalDuration = phases.reduce((sum, p) => sum + (p.duration || 0), 0);

    // Get slowest notes (top 5)
    const noteEntries = Array.from(this.noteTimings.entries())
      .map(([path, duration]) => ({ path, duration }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);

    const notesProcessed = this.noteTimings.size;
    const averageTimePerNote = notesProcessed > 0 ? totalDuration / notesProcessed : 0;
    const cacheHitRate = this.imageMetrics.processed > 0 
      ? (this.imageMetrics.cacheHits / this.imageMetrics.processed * 100)
      : 0;

    return {
      totalDuration,
      phases,
      notesProcessed,
      imagesProcessed: this.imageMetrics.processed,
      imagesDeduplicated: this.imageMetrics.deduplicated,
      imageCacheHits: this.imageMetrics.cacheHits,
      imageCacheHitRate: cacheHitRate,
      averageTimePerNote,
      slowestNotes: noteEntries,
    };
  }

  exportToFile(): void {
    if (!this.isDebugMode()) return;

    const metrics = this.getMetrics();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `debug-export-${timestamp}.json`;

    const data = JSON.stringify(metrics, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  reset(): void {
    this.logs = [];
    this.currentPhase = null;
    this.noteTimings.clear();
    this.imageMetrics = { processed: 0, deduplicated: 0, cacheHits: 0 };
  }

  printSummary(): void {
    if (!this.isDebugMode()) return;

    // Debug output collected via getMetrics() - silent in production
  }
}

export const debugLogger = new DebugLogger();
export default debugLogger;

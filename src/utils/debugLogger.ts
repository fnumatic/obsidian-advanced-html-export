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
           (typeof window !== 'undefined' && (window as any).ADVANCED_HTML_EXPORT_DEBUG === true);
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

    console.log(`[DebugLogger] Starting phase: ${phase}`, details || '');
  }

  endPhase(): void {
    if (!this.isDebugMode() || !this.currentPhase) return;

    const endTime = performance.now();
    const duration = endTime - this.currentPhase.startTime;

    this.currentPhase.endTime = endTime;
    this.currentPhase.duration = duration;

    this.logs.push({ ...this.currentPhase });

    console.log(
      `[DebugLogger] Completed phase: ${this.currentPhase.phase} (${duration.toFixed(2)}ms)`
    );

    this.currentPhase = null;
  }

  logNoteStart(path: string): void {
    if (!this.isDebugMode()) return;
    this.noteTimings.set(path, performance.now());
    console.log(`[DebugLogger] Starting note: ${path}`);
  }

  logNoteEnd(path: string): void {
    if (!this.isDebugMode()) return;
    const startTime = this.noteTimings.get(path);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.noteTimings.set(path, duration);
      console.log(`[DebugLogger] Completed note: ${path} (${duration.toFixed(2)}ms)`);
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
    console.log(`[DebugLogger] Exported debug log to ${filename}`);
  }

  reset(): void {
    this.logs = [];
    this.currentPhase = null;
    this.noteTimings.clear();
    this.imageMetrics = { processed: 0, deduplicated: 0, cacheHits: 0 };
  }

  printSummary(): void {
    if (!this.isDebugMode()) return;

    const metrics = this.getMetrics();
    console.log('\n=== DEBUG SUMMARY ===');
    console.log(`Total Duration: ${(metrics.totalDuration / 1000).toFixed(2)}s`);
    console.log(`Notes Processed: ${metrics.notesProcessed}`);
    console.log(`Average Time per Note: ${metrics.averageTimePerNote.toFixed(2)}ms`);
    console.log(`Images Processed: ${metrics.imagesProcessed}`);
    console.log(`Images Deduplicated: ${metrics.imagesDeduplicated}`);
    console.log(`Cache Hit Rate: ${metrics.imageCacheHitRate.toFixed(1)}%`);
    console.log('\nSlowest Notes:');
    metrics.slowestNotes.forEach((note, i) => {
      console.log(`  ${i + 1}. ${note.path}: ${note.duration.toFixed(2)}ms`);
    });
    console.log('\nPhase Breakdown:');
    metrics.phases.forEach((phase) => {
      console.log(`  ${phase.phase}: ${phase.duration?.toFixed(2)}ms`);
      if (phase.details) {
        console.log(`    Details:`, phase.details);
      }
    });
    console.log('=====================\n');
  }
}

export const debugLogger = new DebugLogger();
export default debugLogger;

export class PauseController {
  private _isPaused = false;
  private _resumePromise: Promise<void> | null = null;
  private _resolveResume: (() => void) | null = null;
  private _pauseCallbacks: (() => void)[] = [];
  private _resumeCallbacks: (() => void)[] = [];

  get isPaused(): boolean {
    return this._isPaused;
  }

  pause(): void {
    if (this._isPaused) return;
    
    this._isPaused = true;
    this._resumePromise = new Promise((resolve) => {
      this._resolveResume = resolve;
    });
    
    this._pauseCallbacks.forEach(cb => cb());
  }

  resume(): void {
    if (!this._isPaused) return;
    
    this._isPaused = false;
    
    if (this._resolveResume) {
      this._resolveResume();
      this._resolveResume = null;
    }
    
    this._resumePromise = null;
    this._resumeCallbacks.forEach(cb => cb());
  }

  async waitIfPaused(): Promise<void> {
    if (this._isPaused && this._resumePromise !== null) {
      await this._resumePromise;
    }
  }

  onPause(callback: () => void): void {
    this._pauseCallbacks.push(callback);
  }

  onResume(callback: () => void): void {
    this._resumeCallbacks.push(callback);
  }

  reset(): void {
    this._isPaused = false;
    this._resumePromise = null;
    this._resolveResume = null;
    this._pauseCallbacks = [];
    this._resumeCallbacks = [];
  }
}

export default PauseController;

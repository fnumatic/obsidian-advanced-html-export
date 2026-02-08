export class CancellationError extends Error {
  constructor(message = 'Operation was cancelled') {
    super(message);
    this.name = 'CancellationError';
  }
}

export class CancellationToken {
  private _cancelled = false;
  private _callbacks: (() => void)[] = [];

  cancel(): void {
    if (this._cancelled) return;
    this._cancelled = true;
    this._callbacks.forEach(cb => cb());
    this._callbacks = [];
  }

  get isCancelled(): boolean {
    return this._cancelled;
  }

  onCancel(callback: () => void): void {
    if (this._cancelled) {
      callback();
    } else {
      this._callbacks.push(callback);
    }
  }

  throwIfCancelled(): void {
    if (this._cancelled) {
      throw new CancellationError();
    }
  }
}

export default CancellationToken;

/**
 * Simple debouncer utility for batching rapid events
 */
export class Debouncer {
  private timeoutId: NodeJS.Timeout | null = null;
  private readonly delay: number;
  constructor(delay = 300) {
    this.delay = delay;
  }

  /**
   * Debounce a function call. If called again before the delay expires,
   * the previous call is cancelled and a new timer is started.
   */
  debounce(fn: () => void | Promise<void>): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(async () => {
      this.timeoutId = null;
      await fn();
    }, this.delay);
  }

  /**
   * Cancel any pending debounced call
   */
  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Check if there's a pending debounced call
   */
  isPending(): boolean {
    return this.timeoutId !== null;
  }
}

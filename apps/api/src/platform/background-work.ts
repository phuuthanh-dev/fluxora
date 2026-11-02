/** Track only work accepted from a timer. Request handlers and queue workers
 * have separate lifecycles and must be drained by their own owners. */
export class BackgroundWork {
  private stopping = false;
  private readonly pending = new Set<Promise<void>>();

  start(work: () => Promise<unknown>, onError: () => void): void {
    if (this.stopping) return;
    const task = Promise.resolve().then(work).then(() => undefined, () => { try { onError(); } catch { /* Shutdown must not leave a rejected timer promise. */ } }).finally(() => { this.pending.delete(task); });
    this.pending.add(task);
  }

  async drain(): Promise<void> {
    this.stopping = true;
    await Promise.all([...this.pending]);
  }
}

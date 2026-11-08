/** Runs tasks one after another per key, while tasks for different keys run in parallel. */
export class KeyedQueue {
  /** The last queued task per key, which never rejects so a failed task doesn't block the ones after it. */
  private tails = new Map<string, Promise<unknown>>();

  /** Queue a task behind the other tasks for the same key. */
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.catch(() => undefined);

    this.tails.set(key, tail);
    // Forget the key once its queue is empty, so the map doesn't grow with every key ever used
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });

    return result;
  }
}

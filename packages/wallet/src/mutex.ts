/**
 * Mutex - Simple async mutex for preventing race conditions
 * 
 * Ensures that critical sections (like wallet operations) run sequentially,
 * preventing data corruption from concurrent access.
 * 
 * @example
 * ```ts
 * const mutex = new Mutex();
 * 
 * // Operations will queue up and run sequentially
 * await mutex.runExclusive(async () => {
 *   // Critical section
 *   await updateBalance();
 * });
 * ```
 */
export class Mutex {
  private _locked = false;
  private _queue: Array<(value: () => void) => void> = [];

  /**
   * Whether the mutex is currently locked
   */
  get isLocked(): boolean {
    return this._locked;
  }

  /**
   * Number of operations waiting in queue
   */
  get queueLength(): number {
    return this._queue.length;
  }

  /**
   * Acquire the lock. Returns a release function.
   * 
   * @example
   * ```ts
   * const release = await mutex.acquire();
   * try {
   *   // Critical section
   * } finally {
   *   release();
   * }
   * ```
   */
  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (!this._locked) {
        this._locked = true;
        resolve(() => this.release());
      } else {
        // Queue the resolver to be called when lock is released
        this._queue.push(resolve);
      }
    });
  }

  /**
   * Release the lock, allowing next queued operation to proceed
   */
  private release(): void {
    const next = this._queue.shift();
    if (next) {
      // Pass release function to the next waiter (lock stays acquired)
      next(() => this.release());
    } else {
      this._locked = false;
    }
  }

  /**
   * Run a function with exclusive access.
   * 
   * This is the recommended way to use the mutex - it automatically
   * handles acquiring and releasing the lock, even if the function throws.
   * 
   * @param fn - Async function to run exclusively
   * @returns Result of the function
   * 
   * @example
   * ```ts
   * const result = await mutex.runExclusive(async () => {
   *   const token = await createToken(amount);
   *   return token;
   * });
   * ```
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Try to acquire the lock without waiting.
   * Returns null if lock is already held.
   * 
   * @example
   * ```ts
   * const release = mutex.tryAcquire();
   * if (release) {
   *   try {
   *     // Got the lock
   *   } finally {
   *     release();
   *   }
   * } else {
   *   // Lock is busy
   * }
   * ```
   */
  tryAcquire(): (() => void) | null {
    if (this._locked) {
      return null;
    }
    this._locked = true;
    return () => this.release();
  }
}

/**
 * Create a mutex-wrapped version of an async function.
 * 
 * Useful for wrapping existing functions to make them thread-safe.
 * 
 * @example
 * ```ts
 * const safeFetch = withMutex(mutex, async (url: string) => {
 *   return fetch(url);
 * });
 * 
 * // All calls are serialized
 * await Promise.all([
 *   safeFetch('/a'),
 *   safeFetch('/b'),
 *   safeFetch('/c'),
 * ]);
 * ```
 */
export function withMutex<T extends (...args: any[]) => Promise<any>>(
  mutex: Mutex,
  fn: T
): T {
  return (async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    return mutex.runExclusive(() => fn(...args));
  }) as T;
}

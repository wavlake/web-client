/**
 * Mutex tests
 */

import { describe, it, expect, vi } from 'vitest';
import { Mutex, withMutex } from '../src/mutex.js';

describe('Mutex', () => {
  describe('basic functionality', () => {
    it('should create unlocked mutex', () => {
      const mutex = new Mutex();
      expect(mutex.isLocked).toBe(false);
      expect(mutex.queueLength).toBe(0);
    });

    it('should acquire and release lock', async () => {
      const mutex = new Mutex();
      
      const release = await mutex.acquire();
      expect(mutex.isLocked).toBe(true);
      
      release();
      expect(mutex.isLocked).toBe(false);
    });

    it('should tryAcquire when unlocked', () => {
      const mutex = new Mutex();
      
      const release = mutex.tryAcquire();
      expect(release).not.toBe(null);
      expect(mutex.isLocked).toBe(true);
      
      release!();
      expect(mutex.isLocked).toBe(false);
    });

    it('should return null from tryAcquire when locked', async () => {
      const mutex = new Mutex();
      
      const release = await mutex.acquire();
      expect(mutex.tryAcquire()).toBe(null);
      
      release();
    });
  });

  describe('runExclusive', () => {
    it('should run function exclusively', async () => {
      const mutex = new Mutex();
      const result = await mutex.runExclusive(async () => {
        return 42;
      });
      expect(result).toBe(42);
    });

    it('should release lock after function completes', async () => {
      const mutex = new Mutex();
      
      await mutex.runExclusive(async () => {
        expect(mutex.isLocked).toBe(true);
      });
      
      expect(mutex.isLocked).toBe(false);
    });

    it('should release lock on error', async () => {
      const mutex = new Mutex();
      
      await expect(mutex.runExclusive(async () => {
        throw new Error('Test error');
      })).rejects.toThrow('Test error');
      
      expect(mutex.isLocked).toBe(false);
    });

    it('should queue concurrent operations', async () => {
      const mutex = new Mutex();
      const order: number[] = [];
      
      // Start three concurrent operations
      const p1 = mutex.runExclusive(async () => {
        order.push(1);
        await sleep(10);
        order.push(2);
      });
      
      const p2 = mutex.runExclusive(async () => {
        order.push(3);
        await sleep(10);
        order.push(4);
      });
      
      const p3 = mutex.runExclusive(async () => {
        order.push(5);
        await sleep(10);
        order.push(6);
      });
      
      // Check queue length mid-execution
      expect(mutex.queueLength).toBeGreaterThan(0);
      
      await Promise.all([p1, p2, p3]);
      
      // Operations should run sequentially
      expect(order).toEqual([1, 2, 3, 4, 5, 6]);
      expect(mutex.isLocked).toBe(false);
    });
  });

  describe('serialization guarantee', () => {
    it('should prevent race conditions on shared resource', async () => {
      const mutex = new Mutex();
      let counter = 0;
      
      // Simulate unsafe increment (read, delay, write)
      const unsafeIncrement = async () => {
        const current = counter;
        await sleep(Math.random() * 10);
        counter = current + 1;
      };
      
      // Safe increment using mutex
      const safeIncrement = () => mutex.runExclusive(unsafeIncrement);
      
      // Run 10 concurrent increments
      await Promise.all(Array(10).fill(0).map(safeIncrement));
      
      // With mutex, all increments should be applied correctly
      expect(counter).toBe(10);
    });

    it('should preserve operation order', async () => {
      const mutex = new Mutex();
      const results: number[] = [];
      
      // Start operations in specific order
      const operations = [1, 2, 3, 4, 5].map((n) =>
        mutex.runExclusive(async () => {
          await sleep(5);
          results.push(n);
        })
      );
      
      await Promise.all(operations);
      
      // Results should be in order operations were started
      expect(results).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

describe('withMutex', () => {
  it('should wrap function with mutex', async () => {
    const mutex = new Mutex();
    const fn = vi.fn().mockResolvedValue(42);
    
    const wrapped = withMutex(mutex, fn);
    const result = await wrapped();
    
    expect(fn).toHaveBeenCalled();
    expect(result).toBe(42);
  });

  it('should serialize wrapped function calls', async () => {
    const mutex = new Mutex();
    const order: number[] = [];
    
    const fn = async (n: number): Promise<void> => {
      order.push(n);
      await sleep(5);
    };
    
    const wrapped = withMutex(mutex, fn);
    
    await Promise.all([
      wrapped(1),
      wrapped(2),
      wrapped(3),
    ]);
    
    expect(order).toEqual([1, 2, 3]);
  });

  it('should preserve function signature', async () => {
    const mutex = new Mutex();
    
    const add = async (a: number, b: number): Promise<number> => a + b;
    const wrappedAdd = withMutex(mutex, add);
    
    const result = await wrappedAdd(2, 3);
    expect(result).toBe(5);
  });
});

// Helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

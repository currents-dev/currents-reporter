import { describe, expect, it } from 'vitest';
import { createLimit } from '../limit';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe('createLimit', () => {
  it('runs at most the given number of tasks at a time, in order', async () => {
    const limit = createLimit(3);
    let running = 0;
    let maxRunning = 0;
    const started: number[] = [];

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        limit(async () => {
          started.push(i);
          running++;
          maxRunning = Math.max(maxRunning, running);
          await tick();
          running--;
          return i * 2;
        })
      )
    );

    expect(maxRunning).toBe(3);
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  });

  it('frees the slot of a task that fails', async () => {
    const limit = createLimit(1);
    await expect(
      limit(async () => {
        throw new Error('failed');
      })
    ).rejects.toThrow('failed');
    await expect(limit(async () => 'next')).resolves.toBe('next');
  });
});

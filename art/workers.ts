import { availableParallelism } from 'node:os';

import type { ThemeName } from './themes';

/** A GIF to draw: a theme's avatar or banner, or the overview of the themes named. */
export type GifJob = { kind: 'avatar' | 'banner'; theme: ThemeName } | { kind: 'overview'; themes: ThemeName[] };

/** Has a worker draw a GIF, and waits for it. */
function ask(worker: Worker, job: GifJob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<Uint8Array | { error: string }>) =>
      event.data instanceof Uint8Array ? resolve(event.data) : reject(new Error(`Drawing the ${job.kind} failed: ${event.data.error}`));
    worker.onerror = (event) => reject(new Error(`Drawing the ${job.kind} failed: ${event.message}`));
    worker.postMessage(job);
  });
}

/**
 * Draws GIFs in threads of their own, several at once, one a core by default, each taking the next one to draw as soon as it's done
 * with the one before. Each thread takes a couple of hundred megabytes at most. They're ended once all are drawn, which frees their
 * memory, so a bot that draws now and then doesn't keep it.
 * @returns The GIFs, in the order of the jobs.
 */
export async function drawGifs(jobs: GifJob[], threads = availableParallelism()): Promise<Uint8Array[]> {
  const gifs: Uint8Array[] = [];
  let next = 0;
  const thread = async () => {
    const worker = new Worker(new URL('./gifWorker.ts', import.meta.url).href);
    try {
      while (next < jobs.length) {
        const at = next++;
        gifs[at] = await ask(worker, jobs[at]!);
      }
    } finally {
      worker.terminate();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(threads, jobs.length)) }, thread));
  return gifs;
}

/** Draws one GIF in a thread of its own. */
export const drawGif = async (job: GifJob) => (await drawGifs([job], 1))[0]!;

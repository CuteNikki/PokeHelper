/**
 * Draws a GIF in a thread of its own, as each takes a few seconds, which the bot would otherwise spend not answering anyone, and so
 * several can be drawn at once. Started with a job, answers with the GIF, or with what went wrong. See `drawGifs` in ./workers.
 */

import { avatarGif, bannerGif } from './assets';
import { overviewGif } from './overview';
import { THEMES } from './themes';
import type { GifJob } from './workers';

declare const self: Worker;

self.onmessage = async (event: MessageEvent<GifJob>) => {
  const job = event.data;
  try {
    const gif =
      job.kind === 'overview' ? await overviewGif(job.themes) : await (job.kind === 'avatar' ? avatarGif : bannerGif)(THEMES[job.theme]);
    // Handed over rather than copied, as it's a few megabytes
    postMessage(gif, [gif.buffer as ArrayBuffer]);
  } catch (error) {
    postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};

/**
 * Draws the overview of every theme in a thread of its own, as it takes a few seconds, which the bot would otherwise spend not
 * answering anyone. Started with any message, and answers with the GIF.
 */

import { overviewGif } from './overview';
import { THEMES, type ThemeName } from './themes';

declare const self: Worker;

self.onmessage = () => {
  const gif = overviewGif(Object.keys(THEMES) as ThemeName[]);
  // Handed over rather than copied, as it's a few megabytes
  postMessage(gif, [gif.buffer as ArrayBuffer]);
};

import { extname } from 'node:path';

import { DiscordAPIError, REST, Routes } from 'discord.js';

/**
 * Set the bot's avatar and banner from image files, through Discord's API: the developer portal turns an animated GIF into a still
 * picture, the API keeps it animated.
 *
 * Usage: `bun run profile --avatar path/to/avatar.gif --banner path/to/banner.gif`, either one or both.
 * Discord only lets an avatar change a couple of times an hour, so a rate limit here means waiting a bit.
 */

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is not set in the environment variables.');

const MIME_TYPES: Record<string, string> = { '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
/** Discord's limit for avatars and banners. */
const MAX_SIZE = 10 * 1024 * 1024;

/** The path given after a flag, like the one after `--avatar`. */
const argument = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
};

/** An image file as the data URI Discord takes. */
async function dataUri(path: string): Promise<string> {
  const mime = MIME_TYPES[extname(path).toLowerCase()];
  if (!mime) throw new Error(`${path} isn't a GIF, PNG, JPEG or WebP.`);
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`${path} doesn't exist.`);
  if (file.size > MAX_SIZE) throw new Error(`${path} is ${(file.size / 1024 / 1024).toFixed(1)} MB, Discord takes at most 10 MB.`);
  return `data:${mime};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;
}

const avatarPath = argument('--avatar');
const bannerPath = argument('--banner');
if (!avatarPath && !bannerPath) {
  console.log('Usage: bun run profile --avatar path/to/avatar.gif --banner path/to/banner.gif');
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);
let failed = false;

// One at a time, so one that's rate limited doesn't hold back the other
for (const [field, path] of [
  ['avatar', avatarPath],
  ['banner', bannerPath],
] as const) {
  if (!path) continue;
  try {
    await rest.patch(Routes.user(), { body: { [field]: await dataUri(path) } });
    console.log(`Updated the ${field}.`);
  } catch (error) {
    failed = true;
    // Discord says why in the error's details, like that it was changed too recently
    const message = error instanceof DiscordAPIError ? JSON.stringify(error.rawError) : String(error);
    console.error(`Couldn't update the ${field}: ${message.includes('RATE_LIMIT') ? 'changed too recently, try again in a while.' : message}`);
  }
}
process.exit(failed ? 1 : 0);

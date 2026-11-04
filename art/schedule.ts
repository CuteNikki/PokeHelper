import { SnowflakeUtil } from 'discord.js';

import { themeOn } from './calendar';

/**
 * Which theme the bot wears when over the next twelve months, with the real dates, as Easter moves every year: `bun run themes`.
 * The bot's birthday is the day its application was made, read from DISCORD_ID.
 */

const DAY = 24 * 60 * 60 * 1000;
const id = process.env.DISCORD_ID;
const birthday = id ? new Date(SnowflakeUtil.timestampFrom(id)) : null;
const date = (time: number) => new Date(time).toISOString().slice(0, 10);

console.log(birthday ? `The bot's birthday is on ${date(birthday.getTime()).slice(5)} each year.\n` : 'DISCORD_ID is not set, so the birthday is left out.\n');

const now = new Date();
const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const end = start + 365 * DAY;
let runStart = start;
let theme = themeOn(new Date(start), birthday);
for (let day = start + DAY; day <= end + DAY; day += DAY) {
  const next = day > end ? null : themeOn(new Date(day), birthday);
  if (next === theme) continue;
  const days = (day - runStart) / DAY;
  console.log(`${date(runStart)} to ${date(day - DAY)}  ${theme.padEnd(11)} ${days} ${days === 1 ? 'day' : 'days'}`);
  runStart = day;
  theme = next ?? theme;
}
console.log('\nEach change happens at midnight UTC, and the bot puts it on within 15 minutes.');

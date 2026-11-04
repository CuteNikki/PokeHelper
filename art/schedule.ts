import { SnowflakeUtil } from 'discord.js';

import { scheduleLines } from './calendar';

/**
 * Which theme the bot wears when over the next twelve months, with the real dates, as Easter moves every year: `bun run themes`.
 * The bot's birthday is the day its application was made, read from DISCORD_ID. `/dev theme-calendar` shows the same in Discord.
 */

const id = process.env.DISCORD_ID;
if (!id) console.log('DISCORD_ID is not set, so the birthday is left out.');
console.log(scheduleLines(id ? new Date(SnowflakeUtil.timestampFrom(id)) : null).join('\n'));

import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { runBirthdayJob } from 'utility/birthday';
import { runWeeklyResetJob } from 'utility/leveling';
import { scheduleJob } from 'utility/scheduler';

/** How often the jobs check what's due. Often enough that birthdays are on time, rarely enough to stay cheap. */
const JOB_INTERVAL = 15 * 60 * 1000;

/** Started once the bot is ready, as the jobs need the guilds, and running right away catches up on what was missed while offline. */
export default new Event({
  name: Events.ClientReady,
  once: true,
  execute(_, client) {
    scheduleJob('birthdays', JOB_INTERVAL, () => runBirthdayJob(client));
    scheduleJob('weekly XP reset', JOB_INTERVAL, () => runWeeklyResetJob(client));
  },
});

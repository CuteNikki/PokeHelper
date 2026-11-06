import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { runBirthdayJob } from 'utility/birthday/job';
import { runResetJob } from 'utility/leveling/reset';
import { runProfileThemeJob } from 'utility/profileTheme';
import { scheduleJob } from 'utility/scheduler';

/** How often the jobs check what's due. Often enough that birthdays are on time, rarely enough to stay cheap. */
const JOB_INTERVAL = 15 * 60 * 1000;

/** Started once the bot is ready, as the jobs need the guilds, and running right away catches up on what was missed while offline. */
export default new Event({
  name: Events.ClientReady,
  once: true,
  execute(_, client) {
    scheduleJob('birthdays', JOB_INTERVAL, () => runBirthdayJob(client));
    // One after the other, so when a week and a month start together the monthly reset sees the new weekly winner
    scheduleJob('weekly and monthly XP reset', JOB_INTERVAL, async () => {
      await runResetJob(client, 'weekly');
      await runResetJob(client, 'monthly');
    });
    scheduleJob('profile theme', JOB_INTERVAL, () => runProfileThemeJob(client));
  },
});

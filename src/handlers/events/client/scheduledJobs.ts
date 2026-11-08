import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { deleteOldDrafts } from 'database/giveaways';

import { runBirthdayJob } from 'utility/birthday/job';
import { runClaimJob, runGiveawayJob } from 'utility/giveaways/end';
import { flushPosts } from 'utility/giveaways/sync';
import { runResetJob } from 'utility/leveling/reset';
import { runVoiceXpJob } from 'utility/leveling/voice';
import { runTempBanJob } from 'utility/moderation/tempBans';
import { runReminderJob } from 'utility/reminders/job';
import { runProfileThemeJob } from 'utility/profileTheme';
import { forgetOldUnposted } from 'utility/starboard';
import { scheduleJob } from 'utility/scheduler';
import { DAY, MINUTE, SECOND } from 'utility/duration';

/** How often the jobs check what's due. Often enough that birthdays are on time, rarely enough to stay cheap. */
const JOB_INTERVAL = 15 * MINUTE;
/** How often reminders are checked, so they go off at most this late. */
const REMINDER_INTERVAL = 15 * SECOND;
/** How often temporary bans are checked, so they're lifted at most this late. */
const TEMP_BAN_INTERVAL = MINUTE;
/** How often giveaways are checked, so they end at most this late. */
const GIVEAWAY_INTERVAL = 15 * SECOND;
/** How often giveaway posts are updated, like their number of participants, so a busy one isn't edited with every click. */
const GIVEAWAY_POST_INTERVAL = 5 * SECOND;
/** How often voice XP is given, each time for a minute in voice. */
const VOICE_XP_INTERVAL = MINUTE;

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
    scheduleJob('voice XP', VOICE_XP_INTERVAL, () => runVoiceXpJob(client));
    scheduleJob('profile theme', JOB_INTERVAL, () => runProfileThemeJob(client));
    // Often, as reminders are often only minutes away
    scheduleJob('reminders', REMINDER_INTERVAL, () => runReminderJob(client));
    scheduleJob('temporary bans', TEMP_BAN_INTERVAL, () => runTempBanJob(client));
    scheduleJob('starboard cleanup', DAY, forgetOldUnposted);
    scheduleJob('giveaway posts', GIVEAWAY_POST_INTERVAL, () => flushPosts(client));
    // One after the other, so winners drawn at the end are in before missed claims are looked for
    scheduleJob('giveaways', GIVEAWAY_INTERVAL, async () => {
      await runGiveawayJob(client);
      await runClaimJob(client);
    });
    scheduleJob('giveaway drafts', JOB_INTERVAL, () => deleteOldDrafts());
  },
});

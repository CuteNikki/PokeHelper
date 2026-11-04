import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import type { Translate } from 'utility/i18next';
import { avatarOf, code, userSubject } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** Someone changed their username, display name or avatar, logged in every server they share with the bot. */
export default new Event({
  name: Events.UserUpdate,
  once: false,
  async execute(client, before, after) {
    if (before.partial || after.bot) return;
    const usernameChanged = before.username !== after.username;
    const displayNameChanged = before.globalName !== after.globalName;
    const avatarChanged = before.avatar !== after.avatar;
    if (!usernameChanged && !displayNameChanged && !avatarChanged) return;

    const name = (value: string | null, t: Translate) => (value ? code(value) : t('logs.changes.none'));
    const changes = (t: Translate) =>
      [
        usernameChanged ? `**${t('logs.username')}** ${code(before.username)} → ${code(after.username)}` : null,
        displayNameChanged ? `**${t('logs.displayName')}** ${name(before.globalName, t)} → ${name(after.globalName, t)}` : null,
        // The new avatar is the picture on the entry
        avatarChanged ? `**${t('logs.avatar')}** ${t('logs.avatarChanged')}` : null,
      ].filter((line): line is string => line !== null);

    for (const guild of client.guilds.cache.values()) {
      if (!guild.members.cache.has(after.id)) continue;
      await sendLog(guild, 'memberProfile', (t) => ({
        kind: 'updated',
        label: t('logs.labels.profile'),
        subject: userSubject(after),
        thumbnail: avatarOf(after),
        details: [changes(t).join('\n')],
        ids: { user: after.id },
      }));
    }
  },
});

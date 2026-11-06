import { bold, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import type { Translate } from 'utility/i18next';
import { oldNew } from 'utility/logs/changes';
import { avatarOf, userSubject } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';
import { code } from 'utility/text';

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

    const name = (value: string | null, t: Translate) => (value ? code(value) : `*${t('logs.changes.none')}*`);
    const changes = (t: Translate) =>
      [
        usernameChanged ? oldNew(t('logs.username'), code(before.username), code(after.username), t) : null,
        displayNameChanged ? oldNew(t('logs.displayName'), name(before.globalName, t), name(after.globalName, t), t) : null,
        // The new avatar is the picture on the entry
        avatarChanged ? `${bold(t('logs.avatar'))} ${t('logs.avatarChanged')}` : null,
      ].filter((line): line is string => line !== null);

    for (const guild of client.guilds.cache.values()) {
      if (!guild.members.cache.has(after.id)) continue;
      await sendLog(guild, 'memberProfile', (t) => ({
        kind: 'updated',
        label: t('logs.labels.profile'),
        about: 'user',
        subject: userSubject(after),
        thumbnail: avatarOf(after),
        details: [changes(t).join('\n\n')],
        ids: { user: after.id },
      }));
    }
  },
});

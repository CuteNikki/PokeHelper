import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import type { Translate } from 'utility/i18next';
import { who } from 'utility/logs/format';
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

    const changes = (t: Translate) =>
      [
        usernameChanged ? `**${t('logs.memberProfile.username')}** ${before.username} → ${after.username}` : null,
        displayNameChanged
          ? `**${t('logs.memberProfile.displayName')}** ${before.globalName ?? t('logs.changes.none')} → ${after.globalName ?? t('logs.changes.none')}`
          : null,
        avatarChanged ? `[${t('logs.memberProfile.newAvatar')}](${after.displayAvatarURL({ size: 512 })})` : null,
      ].filter((line): line is string => line !== null);

    for (const guild of client.guilds.cache.values()) {
      if (!guild.members.cache.has(after.id)) continue;
      await sendLog(guild, 'memberProfile', (t) => ({
        kind: 'updated',
        title: t('logs.memberProfile.title'),
        about: who(after),
        details: [changes(t).join('\n')],
        ids: t('logs.ids.user', { user: after.id }),
      }));
    }
  },
});

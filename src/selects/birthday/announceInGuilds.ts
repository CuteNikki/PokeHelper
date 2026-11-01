import { ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';

import { SelectMenu } from 'classes/base/select';

import { updateUserBirthday } from 'database/birthday';

import { ANNOUNCE_IN_GUILDS_SELECT_ID, buildAnnounceInGuildsPicker, pickedGuilds } from 'utility/birthdayGuilds';
import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { ThemeColors } from 'utility/theme';

/** Saves the servers a member picked to announce their birthday in. It's about their own birthday, so it works however late it's used. */
export default new SelectMenu({
  customId: ANNOUNCE_IN_GUILDS_SELECT_ID,
  isAuthorOnly: true,
  cooldown: 1,
  async execute(interaction) {
    if (!interaction.isStringSelectMenu()) return;
    const t = getTranslate(interaction.locale);
    const selected = pickedGuilds(interaction.values);

    try {
      await updateUserBirthday(interaction.user.id, { announceInGuildIds: selected });
    } catch (error) {
      logger.error(error, `Failed to save the birthday servers of ${interaction.user.id}`);
      return interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(ThemeColors.error)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.announceInGuild.error'))),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    return interaction.update(buildAnnounceInGuildsPicker(interaction.client, interaction.user.id, selected, t, true));
  },
});

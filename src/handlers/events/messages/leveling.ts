import { Collection, ContainerBuilder, Events, MessageFlags, roleMention, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, userMention } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { addXpToUser, getGuildLevelingConfiguration, getLevelFromXP } from 'database/leveling';
import { ensureUser } from 'database/user';

import { formatNumber, MINUTE } from 'utility/duration';
import { guildTranslate } from 'utility/i18next';
import { getChannelChain, syncRewardRoles } from 'utility/leveling/rewards';
import { applyMultiplier, earnsXp, getMultiplier } from 'utility/leveling/rules';
import { logger } from 'utility/logger';
import { logFailure } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** How long a member has to wait between messages that earn XP, in milliseconds. */
const XP_COOLDOWN = MINUTE;
const MIN_XP = 15;
const MAX_XP = 25;

export default new Event({
  name: Events.MessageCreate,
  once: false,
  async execute(client, message) {
    // Only messages members typed themselves earn XP, not bot or system messages
    if (message.author.bot || message.system || !message.inGuild() || !message.member) return;
    const member = message.member;

    // Checked before loading the settings, so chatting a lot doesn't load them with every message.
    // Per guild, so chatting in one server doesn't stop earning XP in another
    const cooldownKey = `${message.guildId}:${member.id}`;
    const timestamps = client.cooldowns.ensure('leveling', () => new Collection());
    const lastXpAt = timestamps.get(cooldownKey);
    if (lastXpAt && Date.now() < lastXpAt + XP_COOLDOWN) return;
    // Taken before waiting for the settings, so a burst of messages can't all get past the check meanwhile
    const now = Date.now();
    timestamps.set(cooldownKey, now);
    // Given back if this message doesn't earn XP, so the next one still can
    const giveBack = () => {
      if (timestamps.get(cooldownKey) === now) timestamps.delete(cooldownKey);
    };

    const levelingConfig = await getGuildLevelingConfiguration(message.guildId);
    if (!levelingConfig?.enabled) return giveBack();

    // Filters and multipliers on a thread's channel or a channel's category apply too
    const context = { channelIds: getChannelChain(message.channel), roleIds: [...member.roles.cache.keys()] };
    if (!earnsXp(levelingConfig, context)) return giveBack();

    setTimeout(giveBack, XP_COOLDOWN);

    const baseXp = Math.floor(Math.random() * (MAX_XP - MIN_XP + 1)) + MIN_XP;
    const xpToAdd = applyMultiplier(baseXp, getMultiplier(levelingConfig.multipliers, context));

    // Make sure the user exists in the database
    await ensureUser(member.id);
    const levelingData = await addXpToUser(message.guildId, member.id, xpToAdd);

    const newLevel = getLevelFromXP(levelingData.xp);
    const oldLevel = getLevelFromXP(levelingData.xp - xpToAdd);

    // Checked with every XP gain, so rewards added later and roles lost by leaving and coming back are given too
    const givenRoles = await syncRewardRoles(member, levelingConfig.rewards, newLevel).catch((error: unknown) => {
      logger.error(error, t('system.leveling.failedAssignment', { level: newLevel, user: message.author.tag, id: member.id, guild: message.guildId }));
      return [];
    });

    // Rewards above are given either way, only the announcement can be turned off
    if (newLevel <= oldLevel || !levelingConfig.levelUpMessages) return;

    const targetChannel = message.guild.channels.cache.get(levelingConfig.levelUpChannelId ?? message.channelId) ?? message.channel;
    if (!targetChannel.isSendable()) return;

    // Everyone in the channel sees it, so it's in the server's language
    const translate = guildTranslate(message.guild);
    const text = [translate('leveling.levelUp.body', { user: userMention(member.id), level: formatNumber(newLevel, translate) })];
    if (givenRoles.length > 0) text.push(translate('leveling.levelUp.rewards', { roles: givenRoles.map(roleMention).join(', '), count: givenRoles.length }));

    await targetChannel
      .send({
        components: [
          new ContainerBuilder()
            .setAccentColor(ThemeColors.success)
            .addSectionComponents(
              new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(text.join('\n')))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(member.displayAvatarURL({ extension: 'png', size: 128 }))),
            ),
        ],
        flags: [MessageFlags.IsComponentsV2],
        // Ping the member who leveled up, but not the reward roles
        allowedMentions: { users: [member.id] },
      })
      .catch(logFailure(t('system.leveling.failedMessage', { level: newLevel, user: message.author.tag, id: member.id, guild: message.guildId })));
  },
});

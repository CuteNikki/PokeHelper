import { Collection, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { MINUTE } from 'utility/duration';
import { awardXp } from 'utility/leveling/award';
import { getChannelChain } from 'utility/leveling/rewards';
import { earnsXp } from 'utility/leveling/rules';

/** How long a member has to wait between messages that earn XP, in milliseconds. */
const XP_COOLDOWN = MINUTE;

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

    await awardXp(member, levelingConfig, context, message.channel);
  },
});

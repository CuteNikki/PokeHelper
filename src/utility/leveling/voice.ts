import type { Client } from 'discord.js';

import { getVoiceLevelingConfigs } from 'database/leveling';

import { awardXp } from 'utility/leveling/award';
import { getChannelChain } from 'utility/leveling/rewards';
import { earnsXp, getVoiceEarners } from 'utility/leveling/rules';
import { logger } from 'utility/logger';

/**
 * Give a minute's XP to everyone in voice who earns it. Run every minute, the same as the most often a message can earn XP.
 * The server's AFK channel never earns XP, and the leveling filters and multipliers of the voice channel and its category apply.
 */
export async function runVoiceXpJob(client: Client<true>) {
  for (const config of await getVoiceLevelingConfigs()) {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) continue;

    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased() || channel.id === guild.afkChannelId) continue;

      const members = [...channel.members.values()];
      const earners = getVoiceEarners(members.map((member) => ({ id: member.id, bot: member.user.bot, deafened: member.voice.deaf ?? false })));

      for (const member of members.filter((member) => earners.includes(member.id))) {
        const context = { channelIds: getChannelChain(channel), roleIds: [...member.roles.cache.keys()] };
        if (!earnsXp(config, context)) continue;

        // One at a time and on its own, so one that fails doesn't stop the others
        await awardXp(member, config, context, channel).catch((error: unknown) =>
          logger.error(error, `Failed to give voice XP to ${member.id} in guild ${guild.id}`),
        );
      }
    }
  }
}

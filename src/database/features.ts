import { prisma } from 'database/index';

/** The switches for all role menus, all voice channels, all sticky messages and all giveaways of a server at once. */
export interface FeatureSwitches {
  roleMenusEnabled: boolean;
  tempVoiceEnabled: boolean;
  stickiesEnabled: boolean;
  giveawaysEnabled: boolean;
}

/** Everything is on until a server turns it off, also for servers the bot doesn't know yet. */
const ALL_ON: FeatureSwitches = { roleMenusEnabled: true, tempVoiceEnabled: true, stickiesEnabled: true, giveawaysEnabled: true };

export async function getFeatureSwitches(guildId: string): Promise<FeatureSwitches> {
  const guild = await prisma.guild.findUnique({
    where: { guildId },
    select: { roleMenusEnabled: true, tempVoiceEnabled: true, stickiesEnabled: true, giveawaysEnabled: true },
  });
  return guild ?? ALL_ON;
}

/** Turn a feature on or off for a server, adding the server to the database first if it isn't in it yet. */
export const setFeatureSwitch = async (guildId: string, key: keyof FeatureSwitches, enabled: boolean) =>
  prisma.guild.upsert({ where: { guildId }, update: { [key]: enabled }, create: { guildId, [key]: enabled } });

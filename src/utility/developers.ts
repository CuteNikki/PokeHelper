import { Team, type Client } from 'discord.js';

/** The bot owner's ID, or the team members' IDs if the bot belongs to a team. Fetched once. */
let developerIds: Promise<Set<string>> | null = null;

/** Whether a user is one of the bot's developers: its owner in the Developer Portal, or a member of the team that owns it. */
export async function isDeveloper(client: Client<true>, userId: string): Promise<boolean> {
  developerIds ??= client.application.fetch().then(({ owner }) => {
    if (owner instanceof Team) return new Set(owner.members.map((member) => member.id));
    return new Set(owner ? [owner.id] : []);
  });

  try {
    return (await developerIds).has(userId);
  } catch (error) {
    // Fetch again next time instead of keeping the failure
    developerIds = null;
    throw error;
  }
}

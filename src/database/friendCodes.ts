import { prisma } from 'database/index';
import { ensureUser } from 'database/user';

import type { FriendCodeGame } from 'utility/friendCodes';

export const getFriendCodes = async (userId: string) => prisma.userFriendCodes.findUnique({ where: { userId } });

/** Save or clear one of someone's codes. */
export async function setFriendCode(userId: string, game: FriendCodeGame, code: string | null) {
  await ensureUser(userId);
  return prisma.userFriendCodes.upsert({ where: { userId }, create: { userId, [game]: code }, update: { [game]: code } });
}

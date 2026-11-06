import { prisma } from 'database/index';

import { RecentCache } from 'utility/cache';

/** Who has a row already, so a command or message doesn't wait for the database each time to make sure. */
const known = new RecentCache<void>(10_000);

/** Make sure someone has a row, which their levels, birthday and the like belong to. Only asks the database the first time. */
export const ensureUser = (userId: string): Promise<void> =>
  known.get(userId, async () => {
    await prisma.user.upsert({ where: { userId }, update: {}, create: { userId } });
  });

/** Forget that someone has a row, once it's deleted. */
export const forgetUser = (userId: string) => known.forget(userId);

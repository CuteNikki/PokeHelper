import { prisma } from 'database/index';

/** Make sure someone has a row, which their levels, birthday and the like belong to. */
export async function ensureUser(userId: string): Promise<void> {
  await prisma.user.upsert({ where: { userId }, update: {}, create: { userId } });
}

import { prisma } from 'database/index';

export const getUserData = async (userId: string) =>
  await prisma.user.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

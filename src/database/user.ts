import type { User } from '@prisma/client';

import { prisma } from 'database/index';

export const getOrCreateUser = async (userId: string): Promise<User> =>
  await prisma.user.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

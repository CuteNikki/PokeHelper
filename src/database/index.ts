import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { PrismaClient } from 'generated/prisma/client';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

/** How long the database takes to answer, in milliseconds. */
export const getDatabaseLatency = async (): Promise<number> => {
  const start = performance.now();
  
  await prisma.$queryRaw`SELECT 1`;
  
  const end = performance.now();
  return Math.round((end - start) * 100) / 100;
};
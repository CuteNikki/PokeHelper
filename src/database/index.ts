import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { PrismaClient } from 'generated/prisma/client';

import { logger } from 'utility/logger';

/**
 * A few connections stay open while the bot is idle. Opening one to a database on another server takes long enough that a button
 * pressed after a pause could miss Discord's 3 seconds to answer. Keep-alive stops the network from quietly dropping the ones kept.
 */
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, min: 2, keepAlive: true });
// A kept connection the server closes, like on a database restart, is reported here, and would crash the bot without a listener.
// The pool replaces it on the next query
pool.on('error', (error) => logger.warn(error, 'An idle database connection was closed'));
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

/** How long the database takes to answer, in milliseconds. */
export const getDatabaseLatency = async (): Promise<number> => {
  const start = performance.now();

  await prisma.$queryRaw`SELECT 1`;

  const end = performance.now();
  return Math.round((end - start) * 100) / 100;
};

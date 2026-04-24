import { prisma } from 'database/index';
import { logger } from 'utility/logger';

interface LeaderboardState {
  messageId: string;
  page: number;
  sortOrder: 'asc' | 'desc';
  weekly: boolean;
}

export const leaderboardCache = new Map<string, LeaderboardState>();

export async function getLeaderboardState(messageId: string): Promise<LeaderboardState | null> {
  if (leaderboardCache.has(messageId)) {
    return leaderboardCache.get(messageId)!;
  }

  const state = await prisma.leaderboardState.findFirst({ where: { messageId } });
  if (state) {
    leaderboardCache.set(messageId, state);
  }

  return state;
}

export async function saveLeaderboardState(state: LeaderboardState): Promise<void> {
  leaderboardCache.set(state.messageId, state);

  await prisma.leaderboardState.upsert({
    where: { messageId: state.messageId },
    update: state,
    create: state,
  });
}

const THIRTY_DAYS_IN_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

async function performCleanup() {
  const cutoffDate = new Date(Date.now() - THIRTY_DAYS_IN_MS);

  const { count } = await prisma.leaderboardState.deleteMany({
    where: { updatedAt: { lt: cutoffDate } },
  });

  if (count > 0) {
    logger.info(`Cleaned up ${count} old leaderboard states from the database.`);
  }

  leaderboardCache.clear();
}

export function startLeaderboardCacheCleanup() {
  setInterval(() => {
    performCleanup().catch((error) => {
      logger.error(error, 'Error cleaning up old leaderboard states:');
    });
  }, ONE_DAY_IN_MS);
}

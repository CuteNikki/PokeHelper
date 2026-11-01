import { logger } from 'utility/logger';

/**
 * Run a job right away and then regularly. The jobs check what's due themselves, like a weekly reset or a birthday,
 * so running them often catches up on whatever was missed while the bot was offline.
 * A run is skipped while the previous one is still going, so slow runs don't pile up.
 * @param name The job's name, for the logs.
 * @param intervalMs How often to run it, in milliseconds.
 */
export function scheduleJob(name: string, intervalMs: number, job: () => Promise<unknown>) {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      await job();
    } catch (error) {
      logger.error(error, `Scheduled job ${name} failed`);
    } finally {
      running = false;
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
}

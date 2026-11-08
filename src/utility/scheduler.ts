import { logger } from 'utility/logger';

/**
 * Run a job right away and then regularly. Jobs check what's due themselves, so frequent runs catch up on what was missed while
 * offline. A run is skipped while the previous one is still going, so slow runs don't pile up.
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

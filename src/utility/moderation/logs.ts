import { bold } from 'discord.js';

import { getRecentCase } from 'database/moderation';

import type { ModCase, ModCaseType } from 'generated/prisma/client';
import { SECOND } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import type { Doer } from 'utility/logs/audit';
import { caseNumber } from 'utility/moderation/run';

/** How old a case can be to still be the one a log is about. */
const MATCH = 30 * SECOND;
/** How often and how long to look for it, as a case made from the audit log can come a moment after the log. */
const TRIES = 4;
const WAIT = SECOND / 2;

/**
 * The case a ban, unban, kick or timeout in the logs made, so the log can say which one it is. Cases of the bot's commands are made
 * before Discord tells the logs, the others when the audit log entry arrives, which the logs wait for too, so this waits a little.
 * @returns The case, or null if there's none, like when the bot can't view the audit log.
 */
export async function findLoggedCase(guildId: string, userId: string, type: ModCaseType): Promise<ModCase | null> {
  const since = new Date(Date.now() - MATCH);
  for (let tried = 1; ; tried++) {
    const modCase = await getRecentCase(guildId, userId, type, since);
    if (modCase) return modCase;
    if (tried >= TRIES) return null;
    await Bun.sleep(WAIT);
  }
}

/** The case of a log, as a part of its entry, or null if it has none. */
export const casePart = (modCase: ModCase | null, t: Translate) => (modCase ? `${bold(t('logs.case'))} ${caseNumber(modCase, t)}` : null);

/**
 * Who did what a log is about, and why: the moderator and reason of its case if it has one, as the audit log names the bot for what its
 * commands do, with the moderator's name in front of the reason. Otherwise who the audit log says.
 */
export const caseDoer = (doer: Doer | null, modCase: ModCase | null): Doer | null =>
  modCase?.moderatorId ? { id: modCase.moderatorId, reason: modCase.reason } : doer;

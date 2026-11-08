import type { AnySelectMenuInteraction, ButtonInteraction, PermissionsBitField, PermissionsString } from 'discord.js';
import { t } from 'i18next';

import { formatPermissions } from 'utility/discord';
import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { takeBurst, takeCooldown, waitMessage } from 'utility/rateLimit';
import { sendError } from 'utility/response';

/** What the button and select handlers have in common, which the checks before running one need. */
interface ComponentHandler<I> {
  options: {
    customId: string;
    isAuthorOnly?: boolean;
    permissions?: PermissionsString[];
    cooldown?: number;
    execute: (interaction: I) => unknown;
  };
}

/** The texts for buttons and for selects, which say which it was. */
const TEXTS = {
  button: { authorOnly: 'system.button.authorOnly', permissions: 'system.button.permissions', error: 'system.button.error' },
  selectMenu: { authorOnly: 'system.selectMenu.authorOnly', permissions: 'system.selectMenu.permissions', error: 'system.selectMenu.error' },
} as const;

/**
 * Run a button's or select's handler, after checking it may be used: by whoever the message is for when it's only theirs, with the
 * permissions it needs, and not too often. Errors are logged and answered, so nobody is left with "This interaction failed".
 * @param handler The handler for its custom ID, or undefined when there is none, like for a component from an older version of the bot.
 */
export async function handleComponent<I extends ButtonInteraction | AnySelectMenuInteraction>(
  interaction: I,
  handler: ComponentHandler<I> | undefined,
  kind: keyof typeof TEXTS,
): Promise<unknown> {
  // Replies are in the user's language, while logs stay in English for developers
  const translate = getTranslate(interaction.locale);
  const texts = TEXTS[kind];
  if (!handler) return sendError(interaction, translate('system.outdated'));
  const { options } = handler;

  if (options.isAuthorOnly) {
    const { message } = interaction;
    if (
      (message.interactionMetadata && message.interactionMetadata.user.id !== interaction.user.id) ||
      // The referenced message may have been deleted, in which case nobody counts as the author
      (message.reference && interaction.user.id !== (await message.fetchReference().catch(() => null))?.author.id)
    ) {
      return sendError(interaction, translate(texts.authorOnly));
    }
  }

  if (options.permissions && interaction.member && !(interaction.member.permissions as PermissionsBitField).has(options.permissions)) {
    const permissions = formatPermissions(options.permissions, translate);
    return sendError(interaction, translate(texts.permissions, { permissions }));
  }

  if (options.cooldown) {
    const freeAt = takeCooldown(options.customId, interaction.user.id, options.cooldown);
    if (freeAt !== null) return sendError(interaction, waitMessage(freeAt, translate));
  }
  // Clicking a few times in a row is normal use, like paging or changing settings, so only spamming is stopped
  const freeAt = takeBurst(`${options.customId}:${interaction.user.id}`);
  if (freeAt !== null) return sendError(interaction, waitMessage(freeAt, translate));

  try {
    await options.execute(interaction);
  } catch (error) {
    logger.error(error, t(texts.error));
    // Picks reply, editReply or followUp depending on how far it got, and never throws itself
    await sendError(interaction, translate(texts.error));
  }
}

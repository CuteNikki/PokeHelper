import type { AnySelectMenuInteraction, PermissionsString } from 'discord.js';

export class SelectMenu {
  constructor(
    public options: {
      /** The custom ID for the select menu, which is used to identify it when interacted with. */
      customId: string;
      /** Whether custom ID is only included or an exact match is required. */
      includesCustomId?: boolean;
      /** Whether the select menu is restricted to the user who triggered the interaction. */
      isAuthorOnly?: boolean;
      /** The permissions required to interact with the select menu. */
      permissions?: PermissionsString[];
      /**
       * A wait in seconds after each use, for heavy work, like creating a file. Without it, a few uses in a row are fine and only
       * spamming is stopped, see `utility/rateLimit`.
       */
      cooldown?: number;
      /** The function to execute when the select menu is interacted with. This is required. */
      execute: (interaction: AnySelectMenuInteraction) => unknown;
    },
  ) {}
}

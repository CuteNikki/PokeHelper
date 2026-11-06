import type { ButtonInteraction, PermissionsString } from 'discord.js';

/** A handler for buttons, found by their custom ID. */
export class Button {
  constructor(
    public options: {
      customId: string;
      /** Whether `customId` is a prefix, for custom IDs that carry state after it. The longest matching prefix wins. */
      includesCustomId?: boolean;
      /** Whether only whoever used the command it's on can use it. */
      isAuthorOnly?: boolean;
      permissions?: PermissionsString[];
      /**
       * A wait in seconds after each use, for heavy work, like creating a file. Without it, a few uses in a row are fine and only
       * spamming is stopped, see `utility/rateLimit`.
       */
      cooldown?: number;
      execute: (interaction: ButtonInteraction) => unknown;
    },
  ) {}
}

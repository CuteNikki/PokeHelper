import type { AnySelectMenuInteraction, PermissionsString } from 'discord.js';

/** A handler for select menus, found by their custom ID. */
export class SelectMenu {
  constructor(
    public options: {
      customId: string;
      /** Whether `customId` is a prefix, for custom IDs that carry state after it. The longest matching prefix wins. */
      includesCustomId?: boolean;
      /** Whether only whoever used the command it's on can use it. */
      isAuthorOnly?: boolean;
      permissions?: PermissionsString[];
      /** A wait in seconds after each use, for heavy work. Without it, only spamming is stopped, see `utility/rateLimit`. */
      cooldown?: number;
      execute: (interaction: AnySelectMenuInteraction) => unknown;
    },
  ) {}
}

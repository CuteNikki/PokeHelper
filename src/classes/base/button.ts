import type { ButtonInteraction, PermissionsString } from 'discord.js';

/**
 * Represents a button with specified options.
 */
export class Button {
  /**
   * Creates an instance of the Button class with the specified options.
   *
   * @param options.customId - The custom ID for the button, which is used to identify it when clicked.
   * @param options.includesCustomId - Whether custom ID is only included or an exact match is required.
   * @param options.isAuthorOnly - Whether the button is restricted to the user who triggered the interaction.
   * @param options.permissions - The permissions required to interact with the button.
   * @param options.cooldown - The cooldown period for the button in seconds. Defaults to 3 seconds.
   * @param options.execute - The function to execute when the button is clicked. This is required.
   */
  constructor(
    public options: {
      /** The custom ID for the button, which is used to identify it when clicked. */
      customId: string;
      /** Whether custom ID is only included or an exact match is required. */
      includesCustomId?: boolean;
      /** Whether the button is restricted to the user who triggered the interaction. */
      isAuthorOnly?: boolean;
      /** The permissions required to interact with the button. */
      permissions?: PermissionsString[];
      /** The cooldown period for the button in seconds. Defaults to 3 seconds. */
      cooldown?: number;
      /** The function to execute when the button is clicked. This is required. */
      execute: (interaction: ButtonInteraction) => unknown;
    },
  ) {
    this.options.cooldown ??= 3; // Default cooldown to 3 seconds if not provided
  }
}

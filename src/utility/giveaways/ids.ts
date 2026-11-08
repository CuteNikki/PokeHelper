import type { PermissionsString } from 'discord.js';

/**
 * Custom IDs of the giveaway list and the panel of a giveaway, after this:
 * - `list:<tab>` and the select `open`, which opens a giveaway
 * - an action and `:<giveaway>`, like `view:<giveaway>`, and the selects `rerollPick:<giveaway>` and `remove:<giveaway>`
 *
 * Kept apart from the panel itself, so the settings of a giveaway can lead back to it without the two importing each other.
 */
export const MANAGE_PREFIX = 'gwm:';

export type ManageAction = 'view' | 'edit' | 'end' | 'cancel' | 'cancelYes' | 'delete' | 'deleteYes' | 'reroll' | 'rerollAll' | 'remove';
export const MANAGE_ACTIONS: ManageAction[] = ['view', 'edit', 'end', 'cancel', 'cancelYes', 'delete', 'deleteYes', 'reroll', 'rerollAll', 'remove'];
export const manageId = (action: ManageAction, giveawayId: string) => `${MANAGE_PREFIX}${action}:${giveawayId}`;

/** What the bot needs in the channel a giveaway is posted in. Reading the history too, as the winners are announced in a reply to the post. */
export const GIVEAWAY_CHANNEL_PERMISSIONS: PermissionsString[] = ['ViewChannel', 'SendMessages', 'ReadMessageHistory'];

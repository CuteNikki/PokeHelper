import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';

/** Whether an error is Discord answering with one of these codes, like UnknownMessage for a message that was deleted. */
export const isDiscordError = (error: unknown, ...codes: RESTJSONErrorCodes[]) =>
  error instanceof DiscordAPIError && codes.includes(error.code as RESTJSONErrorCodes);

/** Whether an error says a message is gone, deleted itself or with its channel. */
export const isMessageGone = (error: unknown) => isDiscordError(error, RESTJSONErrorCodes.UnknownMessage, RESTJSONErrorCodes.UnknownChannel);

/** Whether Discord answered no, unlike when it didn't answer in time or had a problem itself, after which a request may have worked anyway. */
export const isRefused = (error: unknown) => error instanceof DiscordAPIError && error.status < 500;

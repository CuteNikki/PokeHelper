/**
 * Whether each person last looked at a Pokédex entry as text or as the card, so entries opened without saying, like from a link or
 * /dex, are shown the same way. Kept while the bot runs, for the most recent people only, as it's only a convenience.
 */
const MAX_PEOPLE = 1000;
const preferences = new Map<string, boolean>();

/** Remember how someone looked at an entry, as text or not. */
export function rememberTextView(userId: string, text: boolean): void {
  // The newest last, so the oldest is the first to go
  preferences.delete(userId);
  preferences.set(userId, text);
  if (preferences.size > MAX_PEOPLE) preferences.delete(preferences.keys().next().value ?? '');
}

/** Whether someone last looked at an entry as text, or false if they haven't lately. */
export const prefersTextView = (userId: string) => preferences.get(userId) ?? false;

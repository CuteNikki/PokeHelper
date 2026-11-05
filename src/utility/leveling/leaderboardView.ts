import { parseSortOrder } from 'utility/pagination';

/** What a leaderboard message shows. */
export interface LeaderboardView {
  page: number;
  sortOrder: 'asc' | 'desc';
  weekly: boolean;
  /** Shown as text instead of an image. */
  text: boolean;
}

/** What a leaderboard button or select does: go to the page in its view, ask for a page, sort, find whoever pressed it, or switch between image and text. */
export type LeaderboardAction = 'first' | 'prev' | 'goto' | 'next' | 'last' | 'sort' | 'me' | 'mode';

/**
 * Custom IDs of the leaderboard's buttons and select are `lb:<action>:<page>:<sort>:<a|w>:<i|t>`, with the view they lead to,
 * so they work however old the message is. The page is checked against the pages that exist when it's shown.
 */
export const LEADERBOARD_CUSTOM_ID_PREFIX = 'lb:';
/** Custom IDs of the popup asking for a page are this, followed by the view it was opened from. */
export const LEADERBOARD_PAGE_MODAL_PREFIX = 'lb-page:';

const ACTIONS: LeaderboardAction[] = ['first', 'prev', 'goto', 'next', 'last', 'sort', 'me', 'mode'];

const encodeView = (view: LeaderboardView) => `${view.page}:${view.sortOrder}:${view.weekly ? 'w' : 'a'}:${view.text ? 't' : 'i'}`;

/** The custom ID of a leaderboard button or select. */
export const leaderboardCustomId = (action: LeaderboardAction, view: LeaderboardView) => `${LEADERBOARD_CUSTOM_ID_PREFIX}${action}:${encodeView(view)}`;

/** The custom ID of the popup asking for a page, opened from a leaderboard showing the view. */
export const leaderboardPageModalId = (view: LeaderboardView) => `${LEADERBOARD_PAGE_MODAL_PREFIX}${encodeView(view)}`;

function decodeView([page, sortOrder, scope, mode]: string[]): LeaderboardView | null {
  const pageNumber = Number(page);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
  if ((scope !== 'a' && scope !== 'w') || (mode !== 'i' && mode !== 't')) return null;
  return { page: pageNumber, sortOrder: parseSortOrder(sortOrder), weekly: scope === 'w', text: mode === 't' };
}

/** The action and view of a leaderboard button or select, or null if it isn't one. */
export function parseLeaderboardCustomId(customId: string): { action: LeaderboardAction; view: LeaderboardView } | null {
  if (!customId.startsWith(LEADERBOARD_CUSTOM_ID_PREFIX)) return null;
  const [action, ...rest] = customId.slice(LEADERBOARD_CUSTOM_ID_PREFIX.length).split(':');
  const view = decodeView(rest);
  if (!view || !ACTIONS.includes(action as LeaderboardAction)) return null;
  return { action: action as LeaderboardAction, view };
}

/** The view a page popup was opened from, or null if it isn't one. */
export function parseLeaderboardPageModalId(customId: string): LeaderboardView | null {
  if (!customId.startsWith(LEADERBOARD_PAGE_MODAL_PREFIX)) return null;
  return decodeView(customId.slice(LEADERBOARD_PAGE_MODAL_PREFIX.length).split(':'));
}

/** The page to show: the one asked for, within the pages there are. */
export const clampPage = (page: number, totalPages: number) => Math.min(Math.max(1, Math.floor(page) || 1), Math.max(1, totalPages));

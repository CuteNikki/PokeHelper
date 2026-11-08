import { type Guild, type GuildTextBasedChannel, messageLink, roleMention, TextDisplayBuilder } from 'discord.js';

import { getGiveaway, type Giveaway, MAX_ACTIVE_GIVEAWAYS, setGiveawayMessage, startGiveaway, unstartGiveaway } from 'database/giveaways';

import { formatNumber } from 'utility/duration';
import { GIVEAWAY_CHANNEL_PERMISSIONS } from 'utility/giveaways/ids';
import { buildGiveawayPost, type PostState } from 'utility/giveaways/post';
import { rulesOf } from 'utility/giveaways/rules';
import { getTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import type { ResponsePayload } from 'utility/response';
import { formatPermissions, missingBotPermissions } from 'utility/settings';

/**
 * A giveaway's post as it's sent and edited, in the server's language from when it started, so everyone sees the same.
 * With a ping role, the role is mentioned above it. Only sending it pings, as edits never do.
 */
export function renderPost(guild: Guild, giveaway: Giveaway, state: PostState): ResponsePayload {
  const t = getTranslate(giveaway.locale);
  const post = buildGiveawayPost(
    giveaway,
    rulesOf(giveaway, (roleId) => guild.roles.cache.has(roleId)),
    state,
    t,
  );
  if (!giveaway.pingRoleId || giveaway.status !== 'active') return post;
  return {
    ...post,
    components: [new TextDisplayBuilder().setContent(roleMention(giveaway.pingRoleId)), ...(post.components ?? [])],
    allowedMentions: { parse: [], roles: [giveaway.pingRoleId] },
  };
}

/** The channel a giveaway is posted in, if the bot can post there. */
function postChannel(guild: Guild, channelId: string): GuildTextBasedChannel | null {
  const channel = guild.channels.cache.get(channelId);
  return channel?.isTextBased() ? channel : null;
}

/**
 * Start a draft and post it.
 * @returns What to tell whoever started it: that it's up with a link to it, or why it couldn't be started.
 */
export async function publishDraft(guild: Guild, giveawayId: string, t: Translate): Promise<{ error: string } | { link: string; channelId: string }> {
  const draft = await getGiveaway(guild.id, giveawayId);
  if (draft?.status !== 'draft') return { error: t('giveaway.draft.gone') };

  // Checked before it starts, so a giveaway is never running without a post
  const channel = postChannel(guild, draft.channelId);
  if (!channel) return { error: t('giveaway.draft.missingChannel') };
  const missing = missingBotPermissions(guild, channel.id, GIVEAWAY_CHANNEL_PERMISSIONS);
  if (missing.length > 0) return { error: t('giveaway.draft.missingPermissions', { permissions: formatPermissions(missing, t) }) };

  const started = await startGiveaway(guild.id, giveawayId);
  if (started === 'notDraft') return { error: t('giveaway.draft.gone') };
  if (started === 'full') return { error: t('giveaway.draft.full', { max: formatNumber(MAX_ACTIVE_GIVEAWAYS, t) }) };

  try {
    const message = await channel.send(renderPost(guild, started, { participants: 0, winnerIds: [] }));
    await setGiveawayMessage(started.id, message.id);
    return { link: messageLink(channel.id, message.id, guild.id), channelId: channel.id };
  } catch (error) {
    // Like when the permissions changed meanwhile. Back to a draft, so it can be started again once it can be posted
    logger.warn(error, `Failed to post giveaway ${started.id} in channel ${channel.id} of guild ${guild.id}`);
    await unstartGiveaway(started.id);
    return { error: t('giveaway.draft.postFailed') };
  }
}

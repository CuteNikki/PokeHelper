import { time, TimestampStyles, type GuildMember, type SendableChannels } from 'discord.js';

import type { Translate } from 'utility/i18next';
import { oldNew } from 'utility/logs/changes';
import { transcriptFile, type TranscriptMessage } from 'utility/logs/files';
import { ago, avatarOf, channelRef, channelSubject, code, reasonPart, roleSubject, userSubject } from 'utility/logs/format';
import { deletedText, editedText } from 'utility/logs/messages';
import { postLogEntry, type LogEntry } from 'utility/logs/send';

/** A long text, to show how entries handle messages too long to show in full. */
const LONG_TEXT = Array.from(
  { length: 40 },
  (_, line) => `Line ${line + 1}: a long message, like rules or a story someone pasted, to see what happens when it's edited or deleted.`,
).join('\n');

/**
 * Sample log entries about someone, of every kind, to see how logs look without making the changes. Built the same way as real ones,
 * with made-up details where there's nothing real to show. The bot plays the moderator, so who it's about and who did it differ.
 */
export function previewEntries(member: GuildMember, channelId: string, t: Translate): LogEntry[] {
  const { guild } = member;
  const bot = guild.client.user;
  const subject = userSubject(member.user);
  const thumbnail = avatarOf(member);
  const by = { id: bot.id, reason: null };
  const byWithReason = { id: bot.id, reason: 'Spamming the counting channel' };
  const where = channelRef(guild, channelId);
  const link = (key: 'logs.jumpToMessage' | 'logs.jumpToContext') => ({ label: t(key), url: `https://discord.com/channels/${guild.id}/${channelId}` });
  const none = `*${t('logs.changes.none')}*`;

  // Real roles where the server has them, so their mentions show as they would
  const roles = [...guild.roles.cache.values()].filter((role) => role.id !== guild.id && !role.managed).slice(0, 3);
  const role = (index: number, fallback: string) => (roles[index] ? roleSubject(roles[index].id, roles[index].name) : code(`@${fallback}`));
  const emoji = guild.emojis.cache.first();

  const shortEdit = editedText('i founf the command, its called piku', 'i found the command, it’s called pokedex', '1', t);
  const longEdit = editedText(LONG_TEXT, LONG_TEXT.replace('Line 20', 'Line twenty'), '2', t);
  const deleted = deletedText('well, i bought panda express on his phone with his card', '3', t);

  const purged: TranscriptMessage[] = ['hi', 'buy cheap nitro at totally-real.link', 'click it!!', 'ok bye'].map((content, index) => ({
    createdAt: new Date(Date.now() - (4 - index) * 60_000),
    username: index % 2 === 0 ? member.user.username : 'spammer',
    userId: index % 2 === 0 ? member.id : '123456789012345678',
    bot: false,
    content,
    attachments: index === 1 ? [{ name: 'free-nitro.png', url: 'https://cdn.discordapp.com/attachments/0/0/free-nitro.png' }] : [],
    stickers: [],
    embeds: index === 1 ? 1 : 0,
  }));

  return [
    {
      kind: 'updated',
      label: t('logs.labels.messageEdited'),
      where,
      about: 'user',
      subject,
      thumbnail,
      details: shortEdit.details,
      ids: { user: member.id, message: '1', channel: channelId },
      link: link('logs.jumpToMessage'),
    },
    {
      kind: 'updated',
      label: t('logs.labels.messageEdited'),
      where,
      about: 'user',
      subject,
      thumbnail,
      details: longEdit.details,
      files: longEdit.files,
      ids: { user: member.id, message: '2', channel: channelId },
      link: link('logs.jumpToMessage'),
    },
    {
      kind: 'deleted',
      label: t('logs.labels.messageDeleted'),
      where,
      about: 'user',
      subject,
      thumbnail,
      by,
      details: [...deleted.details, `**${t('logs.attachments')}** ${code('receipt.png')}`],
      ids: { user: member.id, message: '3', channel: channelId },
      link: link('logs.jumpToContext'),
    },
    {
      kind: 'deleted',
      label: t('logs.labels.messagesBulkDeleted', { count: 5 }),
      about: 'channel',
      subject: where,
      by,
      details: [`-# ${t('logs.bulkNotSeen', { count: 1 })}`],
      ids: { channel: channelId },
      files: [transcriptFile(purged, t('logs.transcriptHeading', { count: 5, channel: 'testing', channelId }), `deleted-messages-${channelId}.txt`)],
    },
    {
      kind: 'updated',
      label: t('logs.labels.rolesChanged'),
      about: 'user',
      subject,
      thumbnail,
      by,
      details: [`**${t('logs.changes.added')}**\n${role(0, 'Melon')}\n${role(1, 'Light Salmon Pink')}`, `**${t('logs.changes.removed')}**\n${role(2, 'Bot')}`],
      ids: { user: member.id, role: roles.map((entry) => entry.id) },
    },
    {
      kind: 'created',
      label: t('logs.labels.rolesAdded', { count: 1 }),
      about: 'user',
      subject,
      thumbnail,
      by,
      details: [`**${t('logs.changes.added')}**\n${role(0, 'Melon')}`],
      ids: { user: member.id, ...(roles[0] ? { role: roles[0].id } : {}) },
    },
    {
      kind: 'updated',
      label: t('logs.labels.memberNickname'),
      about: 'user',
      subject,
      thumbnail,
      by,
      details: [oldNew(t('logs.changes.nickname'), none, code('nikki 🌸'), t)],
      ids: { user: member.id },
    },
    {
      kind: 'updated',
      label: t('logs.labels.profile'),
      about: 'user',
      subject,
      thumbnail,
      details: [
        `${oldNew(t('logs.username'), code('nikki_old'), code(member.user.username), t)}\n\n${oldNew(t('logs.displayName'), none, code(member.displayName), t)}`,
      ],
      ids: { user: member.id },
    },
    {
      kind: 'created',
      label: t('logs.labels.memberJoined'),
      about: 'user',
      subject,
      thumbnail,
      details: [
        `**${t('logs.accountCreated')}** ${ago(member.user.createdTimestamp)}\n**${t('logs.memberCount')}** ${guild.memberCount.toLocaleString(t('locale'))}`,
      ],
      ids: { user: member.id },
    },
    {
      kind: 'deleted',
      label: t('logs.labels.memberLeft'),
      about: 'user',
      subject,
      thumbnail,
      details: [
        `**${t('logs.joined')}** ${ago(member.joinedTimestamp)}`,
        `**${t('logs.roles')}**\n${[role(0, 'Melon'), role(1, 'Light Salmon Pink'), role(2, 'Bot')].join('\n')}`,
      ],
      ids: { user: member.id },
    },
    { kind: 'deleted', label: t('logs.labels.banned'), about: 'user', subject, thumbnail, by: byWithReason, details: [reasonPart(byWithReason, t)], ids: { user: member.id } },
    { kind: 'deleted', label: t('logs.labels.kicked'), about: 'user', subject, thumbnail, by: byWithReason, details: [reasonPart(byWithReason, t)], ids: { user: member.id } },
    {
      kind: 'deleted',
      label: t('logs.labels.timedOut'),
      about: 'user',
      subject,
      thumbnail,
      by: byWithReason,
      details: [`**${t('logs.until')}** ${time(new Date(Date.now() + 60 * 60 * 1000), TimestampStyles.LongDateTime)}`, reasonPart(byWithReason, t)],
      ids: { user: member.id },
    },
    { kind: 'created', label: t('logs.labels.timeoutRemoved'), about: 'user', subject, thumbnail, by, ids: { user: member.id } },
    {
      kind: 'created',
      label: t('logs.labels.channelCreated'),
      about: 'channel',
      subject: channelSubject(channelId, 'new-channel'),
      by,
      details: [`**${t('logs.changes.category')}** ${code('#Text Channels')}`],
      ids: { channel: channelId },
    },
    {
      kind: 'updated',
      label: t('logs.labels.channelUpdated'),
      about: 'channel',
      subject: channelSubject(channelId, 'testing'),
      by,
      details: [
        [
          oldNew(t('logs.changes.name'), code('test'), code('testing'), t),
          oldNew(t('logs.changes.slowmode'), none, code('5'), t),
          `**${t('logs.changes.permissionsFor', { who: code('@everyone') })}**\n${t('logs.changes.nowDenied')}: ${t('permission.SendMessages')}, ${t('permission.AddReactions')}`,
        ].join('\n\n'),
      ],
      ids: { channel: channelId },
    },
    {
      kind: 'updated',
      label: t('logs.labels.roleUpdated'),
      about: 'role',
      subject: role(0, 'Melon'),
      by,
      details: [
        [
          oldNew(t('logs.changes.color'), code('#ff9900'), code('#ffb347'), t),
          `**${t('logs.changes.permissions')}**\n${t('logs.changes.added')}: ${t('permission.ManageMessages')}\n${t('logs.changes.removed')}: ${t('permission.MentionEveryone')}`,
        ].join('\n\n'),
      ],
      ids: { ...(roles[0] ? { role: roles[0].id } : {}) },
    },
    {
      kind: 'updated',
      label: t('logs.labels.serverUpdated'),
      about: 'server',
      subject: code(guild.name),
      thumbnail: guild.iconURL({ size: 128 }),
      by,
      details: [oldNew(t('logs.changes.name'), code('Old Server Name'), code(guild.name), t)],
      ids: { server: guild.id },
    },
    {
      kind: 'created',
      label: t('logs.labels.emojiCreated'),
      about: 'emoji',
      // One of the server's own emojis if it has one, shown like a real entry shows it, itself and its picture
      subject: emoji ? `${emoji.toString()} ${code(`:${emoji.name}:`)}` : code(':pikachu:'),
      thumbnail: emoji?.imageURL({ size: 128 }),
      by,
      ids: { emoji: emoji?.id ?? '1' },
    },
    {
      kind: 'created',
      label: t('logs.labels.threadCreated'),
      where,
      about: 'thread',
      subject: channelSubject(channelId, 'trading pokemon'),
      thumbnail,
      by: { id: member.id, reason: null },
      ids: { channel: channelId },
    },
    {
      kind: 'created',
      label: t('logs.labels.inviteCreated'),
      where,
      about: 'invite',
      subject: code('pokehelper'),
      thumbnail,
      by: { id: member.id, reason: null },
      details: [
        `**${t('logs.invites.uses')}** ${t('logs.invites.unlimited')}\n**${t('logs.invites.expires')}** ${time(new Date(Date.now() + 7 * 86_400_000), TimestampStyles.RelativeTime)}`,
      ],
      ids: { invite: 'pokehelper' },
    },
    { kind: 'created', label: t('logs.labels.voiceJoined'), where, about: 'user', subject, thumbnail, ids: { user: member.id, channel: channelId } },
    {
      kind: 'updated',
      label: t('logs.labels.voiceMoved'),
      about: 'user',
      subject,
      thumbnail,
      details: [`${t('logs.from')}: ${where}\n${t('logs.to')}: ${where}`],
      ids: { user: member.id, channel: channelId },
    },
  ];
}

/** Post the sample entries in a channel, one after another so they stay in order. */
export async function sendPreview(channel: SendableChannels, member: GuildMember, t: Translate) {
  for (const entry of previewEntries(member, channel.id, t)) {
    // Who did it is the bot, or the member for what they started themselves, like a thread
    const doer = entry.by?.id === member.id ? member.user : member.client.user;
    await postLogEntry(channel, entry, t, doer);
  }
}

import { time, TimestampStyles, type GuildMember, type SendableChannels } from 'discord.js';

import type { Translate } from 'utility/i18next';
import { oldNew } from 'utility/logs/changes';
import { markChanges } from 'utility/logs/diff';
import { ago, avatarOf, channelRef, channelSubject, code, roleSubject, userSubject } from 'utility/logs/format';
import { buildLogEntry, quoteText, type LogEntry } from 'utility/logs/send';

/**
 * Sample log entries about someone, to see how logs look without making the changes. Built the same way as real ones,
 * so they look exactly like them, with made-up details where there's nothing real to show.
 */
export function previewEntries(member: GuildMember, channelId: string, t: Translate): LogEntry[] {
  const subject = userSubject(member.user);
  const thumbnail = avatarOf(member);
  const by = { id: member.id, reason: null };
  const edited = markChanges('i founf the command, its called piku', 'i found the command, it’s called pokedex');
  const role = member.roles.highest.id === member.guild.id ? null : member.roles.highest;

  return [
    {
      kind: 'updated',
      label: t('logs.labels.messageEdited'),
      where: channelRef(member.guild, channelId),
      subject,
      thumbnail,
      details: [`**${t('logs.before')}**\n${quoteText(edited.before)}`, `**${t('logs.after')}**\n${quoteText(edited.after)}`],
      ids: { user: member.id, message: '1567627450882723862', channel: channelId },
      link: { label: t('logs.jumpToMessage'), url: `https://discord.com/channels/${member.guild.id}/${channelId}` },
    },
    {
      kind: 'deleted',
      label: t('logs.labels.messageDeleted'),
      where: channelRef(member.guild, channelId),
      subject,
      thumbnail,
      by,
      details: [quoteText('well, i bought panda express on his phone with his card'), `**${t('logs.attachments')}** ${code('receipt.png')}`],
      ids: { user: member.id, message: '1567627450882723862', channel: channelId },
      link: { label: t('logs.jumpToContext'), url: `https://discord.com/channels/${member.guild.id}/${channelId}` },
    },
    {
      kind: 'deleted',
      label: t('logs.labels.rolesRemoved', { count: 1 }),
      subject,
      thumbnail,
      by,
      details: [`**${t('logs.changes.removed')}**\n${role ? roleSubject(role.id, role.name) : code('@Light Salmon Pink')}`],
      ids: { user: member.id },
    },
    {
      kind: 'created',
      label: t('logs.labels.memberJoined'),
      subject,
      thumbnail,
      details: [
        `**${t('logs.accountCreated')}** ${ago(member.user.createdTimestamp)}\n**${t('logs.memberCount')}** ${member.guild.memberCount.toLocaleString(t('locale'))}`,
      ],
      ids: { user: member.id },
    },
    {
      kind: 'updated',
      label: t('logs.labels.channelUpdated'),
      subject: channelSubject(channelId, 'testing'),
      by,
      details: [
        `${oldNew(t('logs.changes.name'), code('test'), code('testing'), t)}\n\n${oldNew(t('logs.changes.slowmode'), `*${t('logs.changes.none')}*`, code('5'), t)}`,
      ],
      ids: { channel: channelId, user: member.id },
    },
    {
      kind: 'deleted',
      label: t('logs.labels.timedOut'),
      subject,
      thumbnail,
      by: { id: member.id, reason: 'Spamming the counting channel' },
      details: [
        `**${t('logs.until')}** ${time(new Date(Date.now() + 60 * 60 * 1000), TimestampStyles.LongDateTime)}`,
        `**${t('logs.reason')}**\n${quoteText('Spamming the counting channel')}`,
      ],
      ids: { user: member.id },
    },
  ];
}

/** Post the sample entries in a channel, one after another so they stay in order. */
export async function sendPreview(channel: SendableChannels, member: GuildMember, t: Translate) {
  for (const entry of previewEntries(member, channel.id, t)) await channel.send(buildLogEntry(entry, t, member.user));
}
